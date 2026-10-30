import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblems, requireUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, conflict, handler } from "@/lib/http";
import { userCreateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const GET = handler(async () => {
  const user = await requireUser();
  requireAdmin(user);
  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, phone: true, role: true, active: true, lastLoginAt: true, memberships: { select: { role: true, event: { select: { name: true, year: true } } } } },
  });
  return NextResponse.json({ users });
});

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  requireAdmin(user);
  const data = userCreateSchema.parse(await req.json());
  const problem = passwordProblems(data.password);
  if (problem) throw badRequest(problem);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict("E-mail já cadastrado");
  const created = await prisma.user.create({
    data: { organizationId: user.organizationId, name: data.name, email: data.email, phone: data.phone ?? null, role: data.role, passwordHash: await hashPassword(data.password) },
    select: { id: true, name: true, email: true, role: true },
  });
  await audit({ organizationId: user.organizationId, userId: user.id, action: "user.create", entity: "User", entityId: created.id, data: { email: created.email, role: created.role }, ip: clientIp(req) });
  return NextResponse.json({ user: created }, { status: 201 });
});
