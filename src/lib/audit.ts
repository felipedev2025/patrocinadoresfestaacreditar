import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type AuditInput = {
  organizationId: string;
  eventId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
};

/** Registra auditoria sem nunca interromper a operação principal. */
export async function audit(input: AuditInput, tx: Prisma.TransactionClient = prisma) {
  try {
    await tx.auditLog.create({ data: { ...input, data: input.data ?? undefined } });
  } catch (err) {
    console.error("[audit] falha ao registrar", input.action, err);
  }
}
