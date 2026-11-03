import { PassThrough, Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { clientIp, handler } from "@/lib/http";
import { listAccess } from "@/lib/official-list/access";
import { writeConferenceWorkbook, type ExportPanelRow, type ExportSlotRow } from "@/lib/official-list/export";
import { slugify } from "@/lib/text";
import { audit } from "@/lib/audit";

const BATCH = 200;

/** Lê os slots em páginas (cursor), para não carregar a lista inteira em memória. */
async function* slotBatches(listId: string): AsyncGenerator<ExportSlotRow[]> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.sponsorSlot.findMany({
      where: { listId },
      orderBy: { order: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true, order: true, listName: true, seller: true, quotaValue: true, paymentMethod: true, notes: true, status: true,
        sponsorship: { select: { displayName: true, logoAssetId: true } },
      },
    });
    if (rows.length === 0) return;
    yield rows.map((s) => {
      const hasLogo = s.status === "LINKED" && !!s.sponsorship?.logoAssetId;
      return {
        order: s.order,
        listName: s.listName,
        seller: s.seller,
        quotaValue: s.quotaValue?.toString() ?? null,
        paymentMethod: s.paymentMethod,
        panelName: s.status === "LINKED" || s.status === "SUGGESTED" ? (s.sponsorship?.displayName ?? null) : null,
        status: s.status === "IGNORED" ? "IGNORADO" : hasLogo ? "OK" : s.status === "SUGGESTED" ? "SUGERIDO" : "FALTA",
        hasLogo,
        notes: s.notes,
      };
    });
    if (rows.length < BATCH) return;
    cursor = rows[rows.length - 1]!.id;
  }
}

async function* panelBatches(listId: string, eventId: string): AsyncGenerator<ExportPanelRow[]> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.sponsorship.findMany({
      where: { eventId, status: { notIn: ["ARCHIVED", "REJECTED"] }, slots: { none: { listId, status: "LINKED" } } },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, displayName: true, status: true, logoAssetId: true, category: { select: { name: true } } },
    });
    if (rows.length === 0) return;
    yield rows.map((p) => ({ name: p.displayName, category: p.category?.name ?? null, status: p.status, hasLogo: !!p.logoAssetId }));
    if (rows.length < BATCH) return;
    cursor = rows[rows.length - 1]!.id;
  }
}

/** Excel de conferência (.xlsx) gerado no servidor em streaming. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ listId: string }> }) => {
  const user = await requireUser();
  const { list, access } = await listAccess(user, (await params).listId, "list.export");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: list.eventId }, select: { name: true, year: true, slug: true } });

  const pass = new PassThrough();
  writeConferenceWorkbook(pass, { eventName: `${event.name} ${event.year}`, listName: list.name }, slotBatches(list.id), panelBatches(list.id, list.eventId)).catch((err) => {
    console.error("[export] falha ao gerar Excel", err instanceof Error ? err.message : err);
    pass.destroy(err instanceof Error ? err : new Error("export"));
  });

  await audit({ organizationId: access.event.organizationId, eventId: list.eventId, userId: user.id, action: "list.export", entity: "ImportedList", entityId: list.id, ip: clientIp(req) });
  const filename = `conferencia-${event.slug}-${slugify(list.name) || "lista"}.xlsx`;
  return new Response(Readable.toWeb(pass) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
