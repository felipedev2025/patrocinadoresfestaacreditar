import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { eventAccess, requireAdmin } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { duplicateEventSchema } from "@/lib/validation";
import { duplicateEvent } from "@/lib/services/events";
import { audit } from "@/lib/audit";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  requireAdmin(user);
  const { eventId } = await params;
  await eventAccess(user, eventId, "event.manage");
  const data = duplicateEventSchema.parse(await req.json());
  const event = await duplicateEvent(eventId, user.id, data);
  await audit({ organizationId: user.organizationId, eventId: event.id, userId: user.id, action: "event.duplicate", entity: "Event", entityId: event.id, data: { from: eventId }, ip: clientIp(req) });
  return NextResponse.json({ event }, { status: 201 });
});
