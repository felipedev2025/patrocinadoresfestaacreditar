import type { ListSource, Prisma, SlotStatus } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../http";
import { createId } from "../ids";
import { keys, storage } from "../storage";
import { assignMatches, decideMatch, rankCandidates, normalizeName, type MatchCandidate } from "../matching";
import { normalizeCompanyName } from "../text";
import type { OfficialRow } from "../official-list/schema";
import { applyEventOrders } from "./ordering";
import { findOrCreateCompany } from "./companies";

const EXT: Record<ListSource, string> = { CSV: "csv", XLSX: "xlsx", PDF: "pdf", IMAGE: "img" };
const MIME: Record<ListSource, string> = {
  CSV: "text/csv",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PDF: "application/pdf",
  IMAGE: "application/octet-stream",
};

type Ctx = { organizationId: string; eventId: string; userId: string };

/** Candidato de match: patrocínio do evento + nomes alternativos (empresa e apelidos aprendidos). */
type SponsorCandidate = { id: string; companyId: string };

async function sponsorCandidates(tx: Prisma.TransactionClient, eventId: string, excludeIds: Set<string>) {
  const rows = await tx.sponsorship.findMany({
    where: { eventId, status: { not: "ARCHIVED" } },
    select: { id: true, displayName: true, companyId: true, company: { select: { name: true, aliases: { select: { alias: true } } } } },
  });
  return rows
    .filter((r) => !excludeIds.has(r.id))
    .map<MatchCandidate<SponsorCandidate>>((r) => ({
      item: { id: r.id, companyId: r.companyId },
      names: [r.displayName, r.company.name, ...r.company.aliases.map((a) => a.alias)],
    }));
}

/** Guarda "nome na lista → empresa" para reaproveitar nas próximas edições (ignora se já é o nome oficial). */
export async function saveAlias(tx: Prisma.TransactionClient, organizationId: string, alias: string, companyId: string) {
  const normalizedAlias = normalizeCompanyName(alias);
  if (normalizedAlias.length < 2) return;
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { normalizedName: true } });
  if (!company || company.normalizedName === normalizedAlias) return;
  await tx.companyAlias.upsert({
    where: { organizationId_normalizedAlias: { organizationId, normalizedAlias } },
    create: { organizationId, normalizedAlias, alias: alias.slice(0, 160), companyId },
    update: { companyId, alias: alias.slice(0, 160) },
  });
}

/**
 * Grava a lista revisada: arquivo original, linhas (slots) e o cruzamento com os patrocinadores
 * já cadastrados. Vínculos automáticos recebem a ordem da lista (eventOrder = slot.order).
 */
export async function commitList(ctx: Ctx, input: { name: string; source: ListSource; file: Buffer | null; rows: OfficialRow[] }) {
  const listId = createId();
  let fileKey: string | null = null;
  if (input.file) {
    fileKey = keys.listFile(ctx.organizationId, ctx.eventId, listId, EXT[input.source]);
    await storage().put(fileKey, input.file, MIME[input.source]);
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.importedList.create({
        data: { id: listId, eventId: ctx.eventId, name: input.name, source: input.source, fileKey, createdById: ctx.userId },
      });
      await tx.sponsorSlot.createMany({
        data: input.rows.map((r) => ({
          listId,
          order: r.order,
          listName: r.company,
          normalizedName: normalizeName(r.company),
          seller: r.seller,
          quotaValue: r.quotaValue,
          paymentMethod: r.paymentMethod,
          notes: r.notes,
        })),
      });
      const slots = await tx.sponsorSlot.findMany({ where: { listId }, select: { id: true, order: true, listName: true } });

      const candidates = await sponsorCandidates(tx, ctx.eventId, new Set());
      const decisions = assignMatches(
        slots.map((s) => ({ key: s.id, name: s.listName })),
        candidates,
      );

      const byStatus = new Map<SlotStatus, { id: string; sponsorshipId: string; confidence: number }[]>();
      const orders: { id: string; eventOrder: number }[] = [];
      const aliases: { alias: string; companyId: string }[] = [];
      for (const s of slots) {
        const d = decisions.get(s.id);
        if (!d || d.kind === "none") continue;
        const status: SlotStatus = d.kind === "link" ? "LINKED" : "SUGGESTED";
        if (!byStatus.has(status)) byStatus.set(status, []);
        byStatus.get(status)!.push({ id: s.id, sponsorshipId: d.best.item.id, confidence: d.best.score });
        if (d.kind === "link") {
          orders.push({ id: d.best.item.id, eventOrder: s.order });
          aliases.push({ alias: s.listName, companyId: d.best.item.companyId });
        }
      }
      // Atualizações por slot (cada um tem um sponsorshipId diferente); poucas centenas no máximo
      for (const [status, items] of byStatus) {
        for (const i of items) {
          await tx.sponsorSlot.update({ where: { id: i.id }, data: { status, sponsorshipId: i.sponsorshipId, matchConfidence: i.confidence } });
        }
      }
      await applyEventOrders(tx, ctx.eventId, orders);
      for (const a of aliases) await saveAlias(tx, ctx.organizationId, a.alias, a.companyId);

      return {
        listId,
        total: slots.length,
        linked: byStatus.get("LINKED")?.length ?? 0,
        suggested: byStatus.get("SUGGESTED")?.length ?? 0,
      };
    },
    { timeout: 30_000 },
  );
}

/** Carrega a lista garantindo que pertence ao evento informado (isolamento entre eventos). */
export async function loadList(listId: string) {
  const list = await prisma.importedList.findUnique({ where: { id: listId }, select: { id: true, eventId: true, name: true } });
  if (!list) throw notFound("Lista não encontrada");
  return list;
}

/**
 * Vincula um logotipo a uma linha da lista: atualiza o patrocínio vinculado ou cria um novo
 * (status PENDENTE, ordem = linha da lista) e guarda o apelido para a próxima edição.
 */
export async function attachAssetToSlot(
  tx: Prisma.TransactionClient,
  ctx: Ctx & { canReview: boolean },
  slotId: string,
  assetId: string,
  confidence: number | null,
) {
  const slot = await tx.sponsorSlot.findUnique({ where: { id: slotId }, include: { list: { select: { eventId: true } }, sponsorship: true } });
  if (!slot || slot.list.eventId !== ctx.eventId) throw notFound("Linha da lista não encontrada");
  if (slot.status === "IGNORED") throw badRequest("Esta linha está marcada como ignorada");
  const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.kind !== "SPONSOR_LOGO" || asset.eventId !== ctx.eventId) throw forbidden("Logotipo inválido para este evento");

  let sponsorship = slot.status === "LINKED" ? slot.sponsorship : null;
  if (!sponsorship) {
    // Empresa: apelido aprendido → nome normalizado → nova empresa
    const alias = await tx.companyAlias.findUnique({
      where: { organizationId_normalizedAlias: { organizationId: ctx.organizationId, normalizedAlias: normalizeCompanyName(slot.listName) } },
    });
    const company = alias
      ? await tx.company.findUniqueOrThrow({ where: { id: alias.companyId } })
      : await findOrCreateCompany(tx, ctx.organizationId, slot.listName);
    sponsorship =
      (await tx.sponsorship.findUnique({ where: { eventId_companyId: { eventId: ctx.eventId, companyId: company.id } } })) ??
      (await tx.sponsorship.create({
        data: {
          eventId: ctx.eventId,
          companyId: company.id,
          displayName: slot.listName,
          status: "PENDING", // decisão: importação nunca aprova sozinha
          source: "INTERNAL",
          createdById: ctx.userId,
          notes: slot.seller ? `Vendedor (lista oficial): ${slot.seller}` : null,
        },
      }));
  }

  const other = await tx.sponsorSlot.findFirst({
    where: { listId: slot.listId, sponsorshipId: sponsorship.id, status: "LINKED", id: { not: slot.id } },
    select: { order: true },
  });
  if (other) throw conflict(`Este patrocinador já está vinculado à linha ${other.order} da lista`);

  await tx.sponsorship.update({ where: { id: sponsorship.id }, data: { logoAssetId: asset.id, eventOrder: slot.order } });
  if (sponsorship.status === "APPROVED" && ctx.canReview) {
    await tx.company.update({ where: { id: sponsorship.companyId }, data: { logoAssetId: asset.id } });
  }
  await tx.mediaAsset.update({ where: { id: asset.id }, data: { companyId: sponsorship.companyId } });
  await tx.sponsorSlot.update({
    where: { id: slot.id },
    data: { status: "LINKED", sponsorshipId: sponsorship.id, pendingAssetId: null, matchConfidence: confidence },
  });
  await saveAlias(tx, ctx.organizationId, slot.listName, sponsorship.companyId);
  return { sponsorshipId: sponsorship.id };
}

/** Linhas que ainda podem receber logotipo pelo upload em lote (sem logo e não ignoradas). */
async function openSlotCandidates(tx: Prisma.TransactionClient, listId: string) {
  const slots = await tx.sponsorSlot.findMany({
    where: { listId, status: { not: "IGNORED" } },
    select: {
      id: true,
      order: true,
      listName: true,
      status: true,
      sponsorship: { select: { displayName: true, logoAssetId: true, company: { select: { name: true, aliases: { select: { alias: true } } } } } },
    },
  });
  return slots
    .filter((s) => !(s.status === "LINKED" && s.sponsorship?.logoAssetId))
    .map<MatchCandidate<{ id: string; order: number; listName: string }>>((s) => ({
      item: { id: s.id, order: s.order, listName: s.listName },
      names: [s.listName, ...(s.sponsorship ? [s.sponsorship.displayName, s.sponsorship.company.name, ...s.sponsorship.company.aliases.map((a) => a.alias)] : [])],
    }));
}

export type LogoMatchResult =
  | { kind: "linked"; slotId: string; order: number; listName: string; confidence: number }
  | { kind: "suggested"; slotId: string; order: number; listName: string; confidence: number; reason: string }
  | { kind: "unidentified"; best: { listName: string; confidence: number } | null };

/**
 * Encaixa um logotipo recém-enviado na melhor linha da lista pelo nome do arquivo
 * (ou por um texto alternativo, como o lido do próprio logo).
 */
export async function matchUploadedLogo(ctx: Ctx & { canReview: boolean }, listId: string, assetId: string, names: string[]): Promise<LogoMatchResult> {
  return prisma.$transaction(async (tx) => {
    const candidates = await openSlotCandidates(tx, listId);
    let ranking: ReturnType<typeof rankCandidates<{ id: string; order: number; listName: string }>> = [];
    for (const n of names) {
      const r = rankCandidates(n, candidates);
      if ((r[0]?.score ?? 0) > (ranking[0]?.score ?? 0)) ranking = r;
    }
    const d = decideMatch(ranking);
    if (d.kind === "link") {
      await attachAssetToSlot(tx, ctx, d.best.item.id, assetId, d.best.score);
      return { kind: "linked", slotId: d.best.item.id, order: d.best.item.order, listName: d.best.item.listName, confidence: d.best.score };
    }
    if (d.kind === "suggest") {
      // Não sobrescreve uma sugestão melhor já existente na mesma linha
      const current = await tx.sponsorSlot.findUnique({ where: { id: d.best.item.id }, select: { pendingAssetId: true, matchConfidence: true, status: true } });
      if (!current?.pendingAssetId || (current.matchConfidence ?? 0) < d.best.score) {
        await tx.sponsorSlot.update({
          where: { id: d.best.item.id },
          data: { pendingAssetId: assetId, matchConfidence: d.best.score, ...(current?.status === "LINKED" ? {} : { status: "SUGGESTED" }) },
        });
        return { kind: "suggested", slotId: d.best.item.id, order: d.best.item.order, listName: d.best.item.listName, confidence: d.best.score, reason: d.reason };
      }
    }
    const best = ranking[0];
    return { kind: "unidentified", best: best ? { listName: best.item.listName, confidence: best.score } : null };
  });
}

/** Painel de conferência: linhas, contadores, "só no painel" e logos não identificadas. */
export async function listConference(listId: string, eventId: string) {
  const [list, slots, panel, unidentified] = await Promise.all([
    prisma.importedList.findUniqueOrThrow({ where: { id: listId }, include: { createdBy: { select: { name: true } } } }),
    prisma.sponsorSlot.findMany({
      where: { listId },
      orderBy: { order: "asc" },
      include: {
        sponsorship: { select: { id: true, displayName: true, status: true, logoAsset: { select: { processedKey: true } } } },
        pendingAsset: { select: { id: true, processedKey: true, originalName: true } },
      },
    }),
    prisma.sponsorship.findMany({
      where: { eventId, status: { notIn: ["ARCHIVED", "REJECTED"] }, slots: { none: { listId, status: "LINKED" } } },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, status: true, category: { select: { name: true } }, logoAsset: { select: { processedKey: true } } },
    }),
    prisma.mediaAsset.findMany({
      where: {
        importedListId: listId,
        sponsorshipLogoOf: { none: {} },
        pendingForSlots: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, processedKey: true, originalName: true, createdAt: true },
    }),
  ]);

  const active = slots.filter((s) => s.status !== "IGNORED");
  const withLogo = active.filter((s) => s.status === "LINKED" && s.sponsorship?.logoAsset).length;
  return { list, slots, panel, unidentified, counts: { total: active.length, withLogo, suggested: active.filter((s) => s.status === "SUGGESTED").length, ignored: slots.length - active.length } };
}

/** Aprova de uma vez os patrocínios vinculados (com logo) que estão pendentes. */
export async function approveLinked(listId: string, ctx: Ctx) {
  return prisma.$transaction(async (tx) => {
    const linked = await tx.sponsorSlot.findMany({
      where: { listId, status: "LINKED", sponsorship: { status: "PENDING", logoAssetId: { not: null } } },
      select: { sponsorship: { select: { id: true, companyId: true, logoAssetId: true } } },
    });
    const items = linked.map((l) => l.sponsorship!).filter(Boolean);
    if (items.length === 0) return 0;
    const res = await tx.sponsorship.updateMany({
      where: { id: { in: items.map((i) => i.id) }, eventId: ctx.eventId, status: "PENDING" },
      data: { status: "APPROVED", reviewedById: ctx.userId, reviewedAt: new Date(), rejectionReason: null },
    });
    // O logotipo aprovado passa a ser o vigente da empresa na biblioteca
    for (const i of items) await tx.company.update({ where: { id: i.companyId }, data: { logoAssetId: i.logoAssetId } });
    return res.count;
  });
}

/** Vincula manualmente (ou confirma a sugestão) uma linha a um patrocínio existente do evento. */
export async function linkSlotToSponsorship(tx: Prisma.TransactionClient, ctx: Ctx, slotId: string, sponsorshipId: string) {
  const slot = await tx.sponsorSlot.findUnique({ where: { id: slotId }, include: { list: { select: { eventId: true } } } });
  if (!slot || slot.list.eventId !== ctx.eventId) throw notFound("Linha da lista não encontrada");
  const sponsorship = await tx.sponsorship.findFirst({ where: { id: sponsorshipId, eventId: ctx.eventId } });
  if (!sponsorship) throw badRequest("Patrocinador não pertence a este evento");
  const other = await tx.sponsorSlot.findFirst({
    where: { listId: slot.listId, sponsorshipId, status: "LINKED", id: { not: slot.id } },
    select: { order: true },
  });
  if (other) throw conflict(`Este patrocinador já está vinculado à linha ${other.order} da lista`);
  await tx.sponsorSlot.update({ where: { id: slot.id }, data: { status: "LINKED", sponsorshipId, matchConfidence: 1 } });
  await tx.sponsorship.update({ where: { id: sponsorshipId }, data: { eventOrder: slot.order } });
  await saveAlias(tx, ctx.organizationId, slot.listName, sponsorship.companyId);
}

/** Desfaz o vínculo e esquece o apelido aprendido para esse par (evita propagar um vínculo errado). */
export async function unlinkSlot(tx: Prisma.TransactionClient, ctx: Ctx, slotId: string) {
  const slot = await tx.sponsorSlot.findUnique({ where: { id: slotId }, include: { list: { select: { eventId: true } }, sponsorship: { select: { companyId: true } } } });
  if (!slot || slot.list.eventId !== ctx.eventId) throw notFound("Linha da lista não encontrada");
  if (slot.sponsorship) {
    await tx.companyAlias.deleteMany({
      where: { organizationId: ctx.organizationId, normalizedAlias: normalizeCompanyName(slot.listName), companyId: slot.sponsorship.companyId },
    });
  }
  await tx.sponsorSlot.update({ where: { id: slot.id }, data: { status: "AWAITING_LOGO", sponsorshipId: null, pendingAssetId: null, matchConfidence: null } });
}
