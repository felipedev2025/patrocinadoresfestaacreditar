import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { unauthorized } from "./http";

export const SESSION_COOKIE = "pt_session";
const SESSION_DAYS = 14;

export type SessionUser = Pick<User, "id" | "name" | "email" | "role" | "organizationId">;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Validação mínima de senha forte (aplicada no cadastro e troca). */
export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return "A senha deve ter no mínimo 10 caracteres";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "A senha deve conter letras e números";
  return null;
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Usuário da sessão atual (memoizado por requisição). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true, organizationId: true, active: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  // Atualiza "visto por último" no máximo a cada 10 minutos para evitar escrita a cada request.
  if (Date.now() - session.lastSeenAt.getTime() > 600_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const { active: _a, ...user } = session.user;
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw unauthorized();
  return user;
}
