import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblems, requireUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, handler, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  active: z.boolean().optional(),
  role: z.enum(["SUPER_ADMIN", "USER"]).optional(),
  password: z.string().min(10).max(200).optional(),
});

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  requireAdmin(user);
  const id = (await params).id;
  const target = await prisma.user.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!target) throw notFound();
  const data = schema.parse(await req.json());
  if (target.id === user.id && (data.active === false || data.role === "USER")) throw badRequest("Você não pode remover o próprio acesso de administrador");
  if (data.password) {
    const problem = passwordProblems(data.password);
    if (problem) throw badRequest(problem);
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { name: data.name, active: data.active, role: data.role, ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}) },
    });
    // Desativar ou trocar senha encerra todas as sessões abertas do usuário
    if (data.active === false || data.password) await tx.session.deleteMany({ where: { userId: id } });
  });
  await audit({ organizationId: user.organizationId, userId: user.id, action: "user.update", entity: "User", entityId: id, data: { ...data, password: data.password ? "***" : undefined }, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
