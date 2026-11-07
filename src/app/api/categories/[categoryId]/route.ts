import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler, notFound } from "@/lib/http";
import { categorySchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ categoryId: string }> };

async function load(categoryId: string) {
  const c = await prisma.sponsorCategory.findUnique({ where: { id: categoryId } });
  if (!c) throw notFound("Categoria não encontrada");
  return c;
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const cat = await load((await params).categoryId);
  const access = await eventAccess(user, cat.eventId, "event.manage");
  const data = categorySchema.partial().parse(await req.json());
  const category = await prisma.sponsorCategory.update({ where: { id: cat.id }, data });
  await audit({ organizationId: access.event.organizationId, eventId: cat.eventId, userId: user.id, action: "category.update", entity: "SponsorCategory", entityId: cat.id, data, ip: clientIp(req) });
  return NextResponse.json({ category });
});

/** Excluir categoria não exclui patrocínios: eles ficam "sem categoria" (onDelete: SetNull). */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const cat = await load((await params).categoryId);
  const access = await eventAccess(user, cat.eventId, "event.manage");
  await prisma.sponsorCategory.delete({ where: { id: cat.id } });
  await audit({ organizationId: access.event.organizationId, eventId: cat.eventId, userId: user.id, action: "category.delete", entity: "SponsorCategory", entityId: cat.id, data: { name: cat.name }, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
