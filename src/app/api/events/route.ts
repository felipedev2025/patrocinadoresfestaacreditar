import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { eventCreateSchema } from "@/lib/validation";
import { createEvent } from "@/lib/services/events";
import { audit } from "@/lib/audit";

/** Lista eventos visíveis ao usuário (admin: todos da organização; demais: eventos vinculados). */
export const GET = handler(async () => {
  const user = await requireUser();
  const events = await prisma.event.findMany({
    where: {
      organizationId: user.organizationId,
      ...(user.role === "SUPER_ADMIN" ? {} : { members: { some: { userId: user.id } } }),
    },
    orderBy: [{ year: "desc" }, { name: "asc" }],
    select: { id: true, name: true, year: true, edition: true, slug: true, status: true, series: true },
  });
  return NextResponse.json({ events });
});

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  requireAdmin(user);
  const data = eventCreateSchema.parse(await req.json());
  const event = await createEvent(user.organizationId, user.id, data);
  await audit({ organizationId: user.organizationId, eventId: event.id, userId: user.id, action: "event.create", entity: "Event", entityId: event.id, ip: clientIp(req) });
  return NextResponse.json({ event }, { status: 201 });
});
