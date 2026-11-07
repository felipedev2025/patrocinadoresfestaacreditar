import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, conflict, handler, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";

export const DELETE = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const f = await prisma.displayFormat.findUnique({ where: { id: (await params).id }, include: { _count: { select: { renders: true } } } });
  if (!f) throw notFound();
  const access = await eventAccess(user, f.eventId, "event.manage");
  if (f._count.renders > 0) throw conflict("Este formato já possui vídeos gerados e não pode ser removido");
  await prisma.displayFormat.delete({ where: { id: f.id } });
  await audit({ organizationId: access.event.organizationId, eventId: f.eventId, userId: user.id, action: "format.delete", entity: "DisplayFormat", entityId: f.id, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
