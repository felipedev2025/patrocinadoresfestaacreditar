import type { EventRole, GlobalRole } from "@prisma/client";
import { prisma } from "./db";
import { forbidden, notFound } from "./http";
import type { SessionUser } from "./auth";

export type Permission =
  | "event.view"
  | "event.manage" // identidade, categorias, formatos, membros, links
  | "sponsorship.create"
  | "sponsorship.viewAll" // ver patrocinadores de todos os captadores
  | "sponsorship.review" // aprovar / rejeitar / arquivar / editar qualquer
  | "sponsorship.delete"
  | "uploadLink.create"
  | "render.create"
  | "render.view"
  | "screen.operate"; // publicar / ordenar playlist do telão

/** Matriz de permissões por papel no evento. SUPER_ADMIN tem todas. */
export const ROLE_PERMISSIONS: Record<EventRole, readonly Permission[]> = {
  ORGANIZER: [
    "event.view",
    "event.manage",
    "sponsorship.create",
    "sponsorship.viewAll",
    "sponsorship.review",
    "sponsorship.delete",
    "uploadLink.create",
    "render.create",
    "render.view",
    "screen.operate",
  ],
  CAPTADOR: ["event.view", "sponsorship.create", "uploadLink.create"],
  OPERATOR: ["event.view", "sponsorship.viewAll", "render.view", "screen.operate"],
};

export function roleCan(globalRole: GlobalRole, eventRole: EventRole | null, perm: Permission): boolean {
  if (globalRole === "SUPER_ADMIN") return true;
  if (!eventRole) return false;
  return ROLE_PERMISSIONS[eventRole].includes(perm);
}

export type EventAccess = {
  event: { id: string; organizationId: string; slug: string; name: string; year: number };
  role: EventRole | null;
  isAdmin: boolean;
  can: (p: Permission) => boolean;
};

/**
 * Carrega o evento garantindo isolamento por organização e vínculo do usuário.
 * Um captador nunca acessa eventos aos quais não está vinculado.
 */
export async function eventAccess(user: SessionUser, eventId: string, required?: Permission): Promise<EventAccess> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: user.organizationId },
    select: {
      id: true,
      organizationId: true,
      slug: true,
      name: true,
      year: true,
      members: { where: { userId: user.id }, select: { role: true } },
    },
  });
  if (!event) throw notFound("Evento não encontrado");
  const role = event.members[0]?.role ?? null;
  const isAdmin = user.role === "SUPER_ADMIN";
  if (!isAdmin && !role) throw notFound("Evento não encontrado");
  const can = (p: Permission) => roleCan(user.role, role, p);
  if (required && !can(required)) throw forbidden();
  const { members: _m, ...ev } = event;
  return { event: ev, role, isAdmin, can };
}

export function requireAdmin(user: SessionUser) {
  if (user.role !== "SUPER_ADMIN") throw forbidden("Apenas o administrador geral pode executar esta ação");
}
