import type { Prisma, SponsorshipSource } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict, forbidden } from "../http";
import { findOrCreateCompany } from "./companies";

/** Valida que o asset pertence ao escopo correto antes de anexá-lo (evita IDOR entre eventos). */
export async function assertUsableAsset(
  tx: Prisma.TransactionClient,
  assetId: string,
  scope: { eventId: string; userId?: string | null; uploadLinkId?: string | null; canReview: boolean },
) {
  const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.kind !== "SPONSOR_LOGO") throw badRequest("Logotipo inválido. Envie o arquivo novamente.");
  if (asset.eventId !== scope.eventId) throw forbidden("Logotipo pertence a outro evento");
  if (scope.uploadLinkId !== undefined && scope.uploadLinkId !== null) {
    if (asset.uploadLinkId !== scope.uploadLinkId) throw forbidden("Logotipo inválido para este link");
  } else if (!scope.canReview && asset.createdById !== scope.userId) {
    throw forbidden("Logotipo enviado por outro usuário");
  }
  return asset;
}

export async function createSponsorship(input: {
  organizationId: string;
  eventId: string;
  userId: string | null;
  canReview: boolean;
  companyId?: string;
  companyName?: string;
  displayName?: string;
  categoryId?: string | null;
  assetId?: string | null;
  logoScale?: number;
  notes?: string | null;
  source: SponsorshipSource;
  uploadLinkId?: string | null;
  approveNow?: boolean;
  contact?: { name?: string | null; email?: string | null };
}) {
  return prisma.$transaction(async (tx) => {
    const company = input.companyId
      ? await tx.company.findFirst({ where: { id: input.companyId, organizationId: input.organizationId } })
      : await findOrCreateCompany(tx, input.organizationId, input.companyName!);
    if (!company) throw badRequest("Empresa não encontrada na biblioteca");

    if (input.categoryId) {
      const cat = await tx.sponsorCategory.findFirst({ where: { id: input.categoryId, eventId: input.eventId }, select: { id: true } });
      if (!cat) throw badRequest("Categoria inválida para este evento");
    }

    const existing = await tx.sponsorship.findUnique({ where: { eventId_companyId: { eventId: input.eventId, companyId: company.id } } });
    if (existing) throw conflict("Esta empresa já está cadastrada neste evento.");

    let logoAssetId: string | null = company.logoAssetId;
    if (input.assetId) {
      const asset = await assertUsableAsset(tx, input.assetId, {
        eventId: input.eventId,
        userId: input.userId,
        uploadLinkId: input.uploadLinkId ?? null,
        canReview: input.canReview,
      });
      logoAssetId = asset.id;
      await tx.mediaAsset.update({ where: { id: asset.id }, data: { companyId: company.id } });
    }

    if (input.contact && (input.contact.name || input.contact.email) && !company.contactEmail) {
      await tx.company.update({
        where: { id: company.id },
        data: { contactName: input.contact.name || null, contactEmail: input.contact.email || null },
      });
    }

    const approve = !!input.approveNow && input.canReview && !!logoAssetId;
    const sponsorship = await tx.sponsorship.create({
      data: {
        eventId: input.eventId,
        companyId: company.id,
        categoryId: input.categoryId ?? null,
        logoAssetId,
        displayName: input.displayName?.trim() || company.name,
        logoScale: input.logoScale ?? 1,
        notes: input.notes ?? null,
        source: input.source,
        uploadLinkId: input.uploadLinkId ?? null,
        createdById: input.userId,
        status: approve ? "APPROVED" : "PENDING",
        reviewedById: approve ? input.userId : null,
        reviewedAt: approve ? new Date() : null,
      },
    });
    if (approve && logoAssetId) await tx.company.update({ where: { id: company.id }, data: { logoAssetId } });
    return sponsorship;
  });
}
