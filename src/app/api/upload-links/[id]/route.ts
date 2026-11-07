import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, forbidden, handler, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";

/** Revoga (desativa) um link de envio. */
export const DELETE = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const link = await prisma.uploadLink.findUnique({ where: { id: (await params).id } });
  if (!link) throw notFound();
  const access = await eventAccess(user, link.eventId, "uploadLink.create");
  if (!access.can("event.manage") && link.createdById !== user.id) throw forbidden();
  await prisma.uploadLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
  await audit({ organizationId: access.event.organizationId, eventId: link.eventId, userId: user.id, action: "uploadLink.revoke", entity: "UploadLink", entityId: link.id, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
