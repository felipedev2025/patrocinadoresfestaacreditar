import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, badRequest, clientIp, handler, tooMany, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { publicSubmitSchema } from "@/lib/validation";
import { resolveUploadLink } from "@/lib/services/upload-links";
import { createSponsorship } from "@/lib/services/sponsorships";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ slug: string; token: string }> };

/**
 * Confirmação do envio pelo patrocinador. O cadastro SEMPRE fica pendente de aprovação:
 * materiais externos nunca são publicados automaticamente.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const { slug, token } = await params;
  const ip = clientIp(req);
  if (!(await rateLimit(`pub:submit:${ip}`, 10, 3600))) throw tooMany();
  const link = await resolveUploadLink(slug, token);
  const body = publicSubmitSchema.parse(await req.json());
  if (body.website) throw badRequest("Envio inválido"); // honeypot

  // Reserva atômica de um uso do link (evita corrida que ultrapasse maxUses)
  const reserved = await prisma.uploadLink.updateMany({
    where: { id: link.id, uses: { lt: link.maxUses }, revokedAt: null },
    data: { uses: { increment: 1 } },
  });
  if (reserved.count === 0) throw new HttpError(410, "Este link já foi utilizado.");

  try {
    const s = await createSponsorship({
      organizationId: link.event.organizationId,
      eventId: link.event.id,
      userId: null,
      canReview: false,
      companyName: body.companyName,
      categoryId: link.categoryId,
      assetId: body.assetId,
      source: "PUBLIC_LINK",
      uploadLinkId: link.id,
      contact: { name: body.contactName, email: body.contactEmail || null },
    });
    // Atribui o cadastro ao captador que gerou o link (para os indicadores por captador)
    if (link.createdById) await prisma.sponsorship.update({ where: { id: s.id }, data: { createdById: link.createdById } });
    await audit({ organizationId: link.event.organizationId, eventId: link.event.id, action: "sponsorship.publicSubmit", entity: "Sponsorship", entityId: s.id, data: { name: s.displayName, linkId: link.id }, ip });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    await prisma.uploadLink.update({ where: { id: link.id }, data: { uses: { decrement: 1 } } });
    throw err;
  }
});
