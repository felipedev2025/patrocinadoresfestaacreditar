import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { eventUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";

type Ctx = { params: Promise<{ eventId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.view");
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { categories: { orderBy: { sortOrder: "asc" } }, formats: { orderBy: { createdAt: "asc" } } },
  });
  // A chave do telão só é exposta a quem opera o telão
  const { screenKey, ...rest } = event!;
  return NextResponse.json({ event: access.can("screen.operate") ? { ...rest, screenKey } : rest, role: access.role });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.manage");
  const body = await req.json();
  const data = eventUpdateSchema.parse(body);
  const event = await prisma.event.update({
    where: { id: eventId },
    data: { ...data, ...(body.rotateScreenKey === true ? { screenKey: randomToken(18) } : {}) },
  });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "event.update", entity: "Event", entityId: eventId, data: { ...data, rotateScreenKey: !!body.rotateScreenKey }, ip: clientIp(req) });
  return NextResponse.json({ event });
});
