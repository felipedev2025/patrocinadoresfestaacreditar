import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, forbidden, handler, notFound } from "@/lib/http";
import { sponsorshipUpdateSchema } from "@/lib/validation";
import { assertUsableAsset } from "@/lib/services/sponsorships";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const s = await prisma.sponsorship.findUnique({ where: { id } });
  if (!s) throw notFound("Patrocinador não encontrado");
  return s;
}

/**
 * Ações: approve | reject | archive | restore | edit.
 * - Revisores (organizador/admin) podem tudo.
 * - O captador pode editar o próprio cadastro; se já estiver aprovado, a alteração volta para "pendente".
 */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const current = await load((await params).id);
  const access = await eventAccess(user, current.eventId, "event.view");
  const canReview = access.can("sponsorship.review");
  const isOwner = current.createdById === user.id && access.can("sponsorship.create");
  const body = sponsorshipUpdateSchema.parse(await req.json());

  if (body.action !== "edit" && !canReview) throw forbidden();
  if (body.action === "edit" && !canReview && !isOwner) throw forbidden();

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.SponsorshipUncheckedUpdateInput = {};
    switch (body.action) {
      case "approve": {
        if (!current.logoAssetId) throw badRequest("Não é possível aprovar sem logotipo");
        Object.assign(data, { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: null });
        // O logotipo aprovado passa a ser o logotipo vigente da empresa na biblioteca
        await tx.company.update({ where: { id: current.companyId }, data: { logoAssetId: current.logoAssetId } });
        break;
      }
      case "reject":
        Object.assign(data, { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: body.rejectionReason ?? null });
        break;
      case "archive":
        Object.assign(data, { status: "ARCHIVED", reviewedById: user.id, reviewedAt: new Date() });
        break;
      case "restore":
        Object.assign(data, { status: "PENDING", rejectionReason: null });
        break;
      case "edit": {
        if (body.displayName !== undefined) data.displayName = body.displayName;
        if (body.logoScale !== undefined) data.logoScale = body.logoScale;
        if (body.notes !== undefined) data.notes = body.notes;
        if (body.categoryId !== undefined) {
          if (body.categoryId) {
            const cat = await tx.sponsorCategory.findFirst({ where: { id: body.categoryId, eventId: current.eventId } });
            if (!cat) throw badRequest("Categoria inválida");
          }
          data.categoryId = body.categoryId;
        }
        if (body.assetId) {
          const asset = await assertUsableAsset(tx, body.assetId, { eventId: current.eventId, userId: user.id, canReview });
          await tx.mediaAsset.update({ where: { id: asset.id }, data: { companyId: current.companyId } });
          data.logoAssetId = asset.id; // versão anterior permanece guardada (histórico)
        }
        if (!canReview && (current.status === "APPROVED" || current.status === "REJECTED")) {
          data.status = "PENDING";
          data.rejectionReason = null;
        }
        if (canReview && current.status === "APPROVED" && body.assetId) {
          await tx.company.update({ where: { id: current.companyId }, data: { logoAssetId: body.assetId } });
        }
        break;
      }
    }
    return tx.sponsorship.update({ where: { id: current.id }, data });
  });

  await audit({
    organizationId: access.event.organizationId,
    eventId: current.eventId,
    userId: user.id,
    action: `sponsorship.${body.action}`,
    entity: "Sponsorship",
    entityId: current.id,
    data: { before: { status: current.status, displayName: current.displayName, categoryId: current.categoryId, logoAssetId: current.logoAssetId }, changes: body },
    ip: clientIp(req),
  });
  return NextResponse.json({ sponsorship: updated });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const current = await load((await params).id);
  const access = await eventAccess(user, current.eventId, "event.view");
  const ownPending = current.createdById === user.id && current.status === "PENDING";
  if (!access.can("sponsorship.delete") && !ownPending) throw forbidden();
  await prisma.sponsorship.delete({ where: { id: current.id } });
  await audit({ organizationId: access.event.organizationId, eventId: current.eventId, userId: user.id, action: "sponsorship.delete", entity: "Sponsorship", entityId: current.id, data: { displayName: current.displayName }, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
