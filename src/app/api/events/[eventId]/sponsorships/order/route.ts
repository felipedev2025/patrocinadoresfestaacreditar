import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { reorderSponsorships } from "@/lib/services/ordering";
import { audit } from "@/lib/audit";

const schema = z.object({ orderedIds: z.array(z.string().min(10).max(40)).min(1).max(2000) });

/** Salva a ordem manual do evento (arrastar e soltar na listagem). */
export const PUT = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "list.manage");
  const { orderedIds } = schema.parse(await req.json());
  const updated = await reorderSponsorships(eventId, orderedIds);
  await audit({
    organizationId: access.event.organizationId,
    eventId,
    userId: user.id,
    action: "sponsorship.reorder",
    entity: "Sponsorship",
    data: { count: updated, first: orderedIds.slice(0, 5) },
    ip: clientIp(req),
  });
  return NextResponse.json({ updated });
});
