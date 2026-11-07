import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, conflict, handler } from "@/lib/http";
import { categorySchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ eventId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  await eventAccess(user, eventId, "event.view");
  const categories = await prisma.sponsorCategory.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ categories });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.manage");
  const data = categorySchema.parse(await req.json());
  if (await prisma.sponsorCategory.findUnique({ where: { eventId_name: { eventId, name: data.name } } })) throw conflict("Já existe uma categoria com este nome");
  const category = await prisma.sponsorCategory.create({ data: { ...data, eventId } });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "category.create", entity: "SponsorCategory", entityId: category.id, data, ip: clientIp(req) });
  return NextResponse.json({ category }, { status: 201 });
});
