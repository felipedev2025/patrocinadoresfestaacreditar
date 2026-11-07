import type { SessionUser } from "../auth";
import { eventAccess, type Permission } from "../rbac";
import { loadList } from "../services/official-list";
import { prisma } from "../db";
import { notFound } from "../http";

/** Resolve a lista → evento e aplica o RBAC do evento (o eventId nunca vem do cliente). */
export async function listAccess(user: SessionUser, listId: string, perm: Permission) {
  const list = await loadList(listId);
  const access = await eventAccess(user, list.eventId, perm);
  return { list, access, ctx: { organizationId: access.event.organizationId, eventId: list.eventId, userId: user.id, canReview: access.can("sponsorship.review") } };
}

export async function slotAccess(user: SessionUser, slotId: string, perm: Permission) {
  const slot = await prisma.sponsorSlot.findUnique({ where: { id: slotId }, select: { id: true, listId: true } });
  if (!slot) throw notFound("Linha da lista não encontrada");
  return { slot, ...(await listAccess(user, slot.listId, perm)) };
}
