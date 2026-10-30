import type { Prisma } from "@prisma/client";
import { normalizeCompanyName, cleanText } from "../text";
import { badRequest } from "../http";

/** Busca empresa da biblioteca por nome normalizado ou cria uma nova (deduplicação). */
export async function findOrCreateCompany(tx: Prisma.TransactionClient, organizationId: string, rawName: string) {
  const name = cleanText(rawName, 120);
  const normalizedName = normalizeCompanyName(name);
  if (normalizedName.length < 2) throw badRequest("Informe o nome da empresa");
  const existing = await tx.company.findUnique({ where: { organizationId_normalizedName: { organizationId, normalizedName } } });
  if (existing) return existing;
  return tx.company.create({ data: { organizationId, name, normalizedName } });
}
