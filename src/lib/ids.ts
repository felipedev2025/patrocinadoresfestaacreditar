import { randomBytes } from "node:crypto";

/** Id ordenável por tempo, compatível com o formato cuid usado pelo Prisma (25 chars, inicia com 'c'). */
export function createId(): string {
  const time = Date.now().toString(36).padStart(9, "0");
  const rand = randomBytes(12).toString("hex").slice(0, 15);
  return `c${time}${rand}`;
}
