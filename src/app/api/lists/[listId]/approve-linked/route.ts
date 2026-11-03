import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, clientIp, forbidden, handler } from "@/lib/http";
import { listAccess } from "@/lib/official-list/access";
import { approveLinked } from "@/lib/services/official-list";
import { audit } from "@/lib/audit";

/** "Aprovar todos os vinculados": pendentes com logotipo vinculados a esta lista passam a aprovados. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ listId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { list, access, ctx } = await listAccess(user, (await params).listId, "list.manage");
  if (!access.can("sponsorship.review")) throw forbidden();
  const approved = await approveLinked(list.id, ctx);
  await audit({ organizationId: access.event.organizationId, eventId: list.eventId, userId: user.id, action: "list.approveLinked", entity: "ImportedList", entityId: list.id, data: { approved }, ip: clientIp(req) });
  return NextResponse.json({ approved });
});
