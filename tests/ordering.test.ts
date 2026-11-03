import "../worker/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyEventOrders, buildBulkOrderUpdate, EVENT_ORDER_BY, reorderSponsorships } from "@/lib/services/ordering";
import { commitList, matchUploadedLogo, approveLinked } from "@/lib/services/official-list";
import { sortSponsors } from "@/remotion/scenes";
import { normalizeCompanyName } from "@/lib/text";
import type { ReelSponsor } from "@/remotion/types";

describe("update em lote (sem N queries)", () => {
  it("gera UM único UPDATE parametrizado, filtrado pelo evento", () => {
    const sql = buildBulkOrderUpdate("ev1", [
      { id: "a", eventOrder: 1 },
      { id: "b", eventOrder: 2 },
      { id: "c", eventOrder: 3 },
    ]);
    expect(sql.text.match(/UPDATE/g)).toHaveLength(1);
    expect(sql.text).toContain(`s."eventId" = $7`);
    expect(sql.values).toEqual(["a", 1, "b", 2, "c", 3, "ev1"]);
    // nenhum valor concatenado no texto da query
    expect(sql.text).not.toContain("ev1");
  });

  it("executa 1 comando por lote de até 500 itens", async () => {
    let calls = 0;
    const fakeTx = { $executeRaw: async (q: Prisma.Sql) => (calls++, q.values.length / 2) } as unknown as Prisma.TransactionClient;
    await applyEventOrders(fakeTx, "ev", Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, eventOrder: i + 1 })));
    expect(calls).toBe(1);
    calls = 0;
    await applyEventOrders(fakeTx, "ev", Array.from({ length: 1200 }, (_, i) => ({ id: `s${i}`, eventOrder: i + 1 })));
    expect(calls).toBe(3);
  });
});

describe("ordem nos vídeos", () => {
  const s = (name: string, categoryOrder: number, eventOrder?: number): ReelSponsor => ({
    id: name, name, logo: "", category: null, categoryColor: "#fff", categoryOrder, seconds: 3, scale: 1, highlight: false, animation: "fade", appearances: 1,
    ...(eventOrder !== undefined ? { eventOrder } : {}),
  });
  it("sequencial: ordem do evento manda; sem ordem vai para o fim em A–Z", () => {
    const out = sortSponsors([s("Zeta", 0), s("Beta", 10, 2), s("Alfa", 10), s("Gama", 0, 1)], "sequential");
    expect(out.map((x) => x.name)).toEqual(["Gama", "Beta", "Zeta", "Alfa"]);
  });
  it("por categoria: categorias primeiro e, dentro delas, a ordem do evento", () => {
    const out = sortSponsors([s("B", 10, 1), s("A", 0, 3), s("C", 0, 2), s("D", 0)], "byCategory");
    expect(out.map((x) => x.name)).toEqual(["C", "A", "D", "B"]);
  });
  it("sem nenhuma ordem manual, o resultado é igual ao anterior (categoria, nome)", () => {
    const out = sortSponsors([s("B", 10), s("A", 10), s("C", 0)], "sequential");
    expect(out.map((x) => x.name)).toEqual(["C", "A", "B"]);
  });
});

// ------------------------------------------------------------------------------------------------
// Integração com PostgreSQL (roda quando o banco do .env está acessível)
// ------------------------------------------------------------------------------------------------
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

describe.runIf(dbUp)("integração: reordenação e lista oficial", () => {
  const tag = `t${Date.now()}`;
  let orgId = "";
  let eventId = "";
  let otherEventId = "";
  let userId = "";
  const ids: Record<string, string> = {};

  async function sponsor(evId: string, name: string) {
    const company = await prisma.company.create({ data: { organizationId: orgId, name, normalizedName: `${normalizeCompanyName(name)} ${tag}` } });
    const sp = await prisma.sponsorship.create({ data: { eventId: evId, companyId: company.id, displayName: name, createdById: userId } });
    return sp.id;
  }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: tag, slug: tag } });
    orgId = org.id;
    userId = (await prisma.user.create({ data: { organizationId: orgId, name: "Teste", email: `${tag}@teste.local`, passwordHash: "x", role: "SUPER_ADMIN" } })).id;
    eventId = (await prisma.event.create({ data: { organizationId: orgId, series: tag, name: "Evento", year: 2026, slug: `${tag}-a`, screenKey: "k" } })).id;
    otherEventId = (await prisma.event.create({ data: { organizationId: orgId, series: tag, name: "Outro", year: 2026, slug: `${tag}-b`, screenKey: "k" } })).id;
    for (const n of ["Bland Seguros", "Porto Net", "Zeta Ltda"]) ids[n] = await sponsor(eventId, n);
    ids.outro = await sponsor(otherEventId, "Patrocinador de outro evento");
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("salva a ordem completa numa transação e lista na ordem do evento", async () => {
    const order = [ids["Zeta Ltda"]!, ids["Bland Seguros"]!, ids["Porto Net"]!];
    expect(await reorderSponsorships(eventId, order)).toBe(3);
    const rows = await prisma.sponsorship.findMany({ where: { eventId }, orderBy: EVENT_ORDER_BY, select: { id: true, eventOrder: true } });
    expect(rows.map((r) => r.id)).toEqual(order);
    expect(rows.map((r) => r.eventOrder)).toEqual([1, 2, 3]);
  });

  it("recusa lista desatualizada ou com patrocinador de outro evento (sem gravar nada)", async () => {
    await expect(reorderSponsorships(eventId, [ids["Bland Seguros"]!, ids["Porto Net"]!])).rejects.toMatchObject({ status: 409 });
    await expect(reorderSponsorships(eventId, [ids["Bland Seguros"]!, ids["Porto Net"]!, ids.outro!])).rejects.toMatchObject({ status: 409 });
    const other = await prisma.sponsorship.findUniqueOrThrow({ where: { id: ids.outro! } });
    expect(other.eventOrder).toBeNull();
    const zeta = await prisma.sponsorship.findUniqueOrThrow({ where: { id: ids["Zeta Ltda"]! } });
    expect(zeta.eventOrder).toBe(1); // ordem anterior preservada
  });

  it("importa a lista, vincula os cadastrados e encaixa logos em lote pelo nome do arquivo", async () => {
    const ctx = { organizationId: orgId, eventId, userId };
    const res = await commitList(ctx, {
      name: "Lista teste",
      source: "CSV",
      file: null,
      rows: [
        { order: 1, company: "Port Net", seller: "Ana", quotaValue: "1500.00", paymentMethod: "PIX", notes: null },
        { order: 2, company: "Bland Seguros", seller: null, quotaValue: "800.00", paymentMethod: null, notes: null },
        { order: 3, company: "Segato Madeiras", seller: null, quotaValue: null, paymentMethod: null, notes: null },
        { order: 4, company: "Segatex", seller: null, quotaValue: null, paymentMethod: null, notes: null },
        { order: 5, company: "R&C Eletritec", seller: null, quotaValue: null, paymentMethod: null, notes: null },
      ],
    });
    expect(res).toMatchObject({ total: 5, linked: 2 });
    // vinculados recebem a ordem da lista
    expect((await prisma.sponsorship.findUniqueOrThrow({ where: { id: ids["Porto Net"]! } })).eventOrder).toBe(1);
    expect((await prisma.sponsorship.findUniqueOrThrow({ where: { id: ids["Bland Seguros"]! } })).eventOrder).toBe(2);
    // apelido aprendido para a próxima edição: "Port Net" → empresa Porto Net
    const alias = await prisma.companyAlias.findFirst({ where: { organizationId: orgId, normalizedAlias: "port net" } });
    expect(alias).not.toBeNull();

    const asset = (name: string) =>
      prisma.mediaAsset.create({
        data: { organizationId: orgId, eventId, importedListId: res.listId, kind: "SPONSOR_LOGO", originalKey: `x/${name}`, processedKey: `x/${name}.png`, mimeType: "image/png", sizeBytes: 1, width: 10, height: 10, sha256: name },
      });
    const lctx = { ...ctx, canReview: true };
    const a1 = await asset("segatex");
    expect((await matchUploadedLogo(lctx, res.listId, a1.id, ["segatex.png"])).kind).toBe("linked");
    const a2 = await asset("segato");
    expect((await matchUploadedLogo(lctx, res.listId, a2.id, ["segato.png"])).kind).toBe("suggested");
    const a3 = await asset("rc");
    expect((await matchUploadedLogo(lctx, res.listId, a3.id, ["R & C.png"])).kind).toBe("suggested");
    const a4 = await asset("bland");
    expect((await matchUploadedLogo(lctx, res.listId, a4.id, ["blandy-seguros.png"])).kind).toBe("linked");
    const a5 = await asset("img");
    expect((await matchUploadedLogo(lctx, res.listId, a5.id, ["IMG_2034.jpg"])).kind).toBe("unidentified");

    // Segatex não existia no painel: foi criado PENDENTE, com logo e ordem 4
    const segatex = await prisma.sponsorSlot.findFirstOrThrow({ where: { listId: res.listId, order: 4 }, include: { sponsorship: true } });
    expect(segatex.status).toBe("LINKED");
    expect(segatex.sponsorship).toMatchObject({ status: "PENDING", eventOrder: 4, logoAssetId: a1.id });

    // "Aprovar todos os vinculados" aprova só os que têm logo
    expect(await approveLinked(res.listId, ctx)).toBe(2); // Segatex + Bland Seguros
    expect((await prisma.sponsorship.findUniqueOrThrow({ where: { id: ids["Porto Net"]! } })).status).toBe("PENDING"); // sem logo
  });
});
