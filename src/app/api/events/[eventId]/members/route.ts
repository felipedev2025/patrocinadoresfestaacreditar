import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, forbidden, handler, notFound } from "@/lib/http";
import { memberSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ eventId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  await eventAccess(user, eventId, "event.manage");
  const members = await prisma.eventMember.findMany({
    where: { eventId },
    include: { user: { select: { id: true, name: true, email: true, active: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ members });
});

/** Vincula um usuário já cadastrado na organização ao evento, com um papel. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.manage");
  const { email, role } = memberSchema.parse(await req.json());
  // Somente o administrador geral pode promover alguém a organizador
  if (role === "ORGANIZER" && !access.isAdmin) throw forbidden("Apenas o administrador geral pode adicionar organizadores");
  const target = await prisma.user.findFirst({ where: { email, organizationId: access.event.organizationId } });
  if (!target) throw notFound("Usuário não encontrado. Peça ao administrador para cadastrá-lo.");
  const member = await prisma.eventMember.upsert({
    where: { eventId_userId: { eventId, userId: target.id } },
    create: { eventId, userId: target.id, role },
    update: { role },
  });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "member.upsert", entity: "EventMember", entityId: member.id, data: { email, role }, ip: clientIp(req) });
  return NextResponse.json({ member }, { status: 201 });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.manage");
  const { userId } = z.object({ userId: z.string().cuid() }).parse(await req.json());
  const m = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId } } });
  if (!m) throw notFound();
  if (m.role === "ORGANIZER" && !access.isAdmin) throw forbidden();
  await prisma.eventMember.delete({ where: { id: m.id } });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "member.remove", entity: "EventMember", entityId: m.id, data: { userId }, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
