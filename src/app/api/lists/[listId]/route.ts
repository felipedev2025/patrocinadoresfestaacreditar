import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { storage } from "@/lib/storage";
import { listAccess } from "@/lib/official-list/access";
import { listConference } from "@/lib/services/official-list";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ listId: string }> };

/** Painel de conferência da lista (todos os textos voltam como dados; o front escapa ao renderizar). */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { list, access } = await listAccess(user, (await params).listId, "list.export");
  const conf = await listConference(list.id, list.eventId);
  const st = storage();
  const url = (key?: string | null) => (key ? st.signedUrl(key, { ttlSec: 3600 }) : Promise.resolve(null));

  const slots = await Promise.all(
    conf.slots.map(async (s) => ({
      id: s.id,
      order: s.order,
      listName: s.listName,
      seller: s.seller,
      quotaValue: s.quotaValue?.toString() ?? null,
      paymentMethod: s.paymentMethod,
      notes: s.notes,
      status: s.status,
      matchConfidence: s.matchConfidence,
      sponsorship: s.sponsorship ? { id: s.sponsorship.id, displayName: s.sponsorship.displayName, status: s.sponsorship.status, logoUrl: await url(s.sponsorship.logoAsset?.processedKey) } : null,
      pendingAsset: s.pendingAsset ? { id: s.pendingAsset.id, url: await url(s.pendingAsset.processedKey), originalName: s.pendingAsset.originalName } : null,
    })),
  );
  const panel = await Promise.all(
    conf.panel.map(async (p) => ({ id: p.id, displayName: p.displayName, status: p.status, category: p.category?.name ?? null, logoUrl: await url(p.logoAsset?.processedKey) })),
  );
  const unidentified = await Promise.all(
    conf.unidentified.map(async (a) => ({ id: a.id, url: await url(a.processedKey), originalName: a.originalName })),
  );
  return NextResponse.json({
    list: { id: conf.list.id, name: conf.list.name, source: conf.list.source, createdAt: conf.list.createdAt, createdBy: conf.list.createdBy?.name ?? null },
    counts: conf.counts,
    slots,
    panel,
    unidentified,
    canManage: access.can("list.manage"),
    canApprove: access.can("sponsorship.review"),
  });
});

/** Exclui a lista e suas linhas. Os patrocinadores cadastrados e a ordem do evento permanecem. */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { list, access } = await listAccess(user, (await params).listId, "list.manage");
  await prisma.importedList.delete({ where: { id: list.id } });
  await audit({ organizationId: access.event.organizationId, eventId: list.eventId, userId: user.id, action: "list.delete", entity: "ImportedList", entityId: list.id, data: { name: list.name }, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
