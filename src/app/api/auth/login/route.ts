import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { assertSameOrigin, clientIp, handler, tooMany, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// Hash fixo para equalizar o tempo de resposta quando o e-mail não existe (evita enumeração)
const DUMMY_HASH = bcrypt.hashSync("senha-inexistente-para-equalizar-tempo", 12);

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  const { email, password } = schema.parse(await req.json());
  if (!(await rateLimit(`login:ip:${ip}`, 20, 900)) || !(await rateLimit(`login:email:${email}`, 8, 900))) throw tooMany();

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) throw unauthorized("E-mail ou senha inválidos");

  await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ organizationId: user.organizationId, userId: user.id, action: "auth.login", entity: "User", entityId: user.id, ip });
  return NextResponse.json({ ok: true });
});
