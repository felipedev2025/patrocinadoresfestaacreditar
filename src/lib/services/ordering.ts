import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict } from "../http";

/** Ordem do evento: quem tem `eventOrder` primeiro; sem ordem vai para o fim, em A–Z. */
export const EVENT_ORDER_BY: Prisma.SponsorshipOrderByWithRelationInput[] = [
  { eventOrder: { sort: "asc", nulls: "last" } },
  { displayName: "asc" },
];

export type OrderAssignment = { id: string; eventOrder: number | null };

/**
 * Monta UM único UPDATE ... FROM (VALUES ...) parametrizado.
 * O filtro por eventId no WHERE impede alterar patrocínios de outro evento mesmo que um id
 * estranho passe pela validação.
 */
export function buildBulkOrderUpdate(eventId: string, items: OrderAssignment[]): Prisma.Sql {
  if (items.length === 0) throw badRequest("Nada para ordenar");
  const values = Prisma.join(items.map((i) => Prisma.sql`(${i.id}, ${i.eventOrder}::int)`));
  return Prisma.sql`
    UPDATE "Sponsorship" AS s
       SET "eventOrder" = v.ord, "updatedAt" = NOW()
      FROM (VALUES ${values}) AS v(id, ord)
     WHERE s."id" = v.id
       AND s."eventId" = ${eventId}`;
}

/** Aplica atribuições de ordem em lote dentro de uma transação existente. Retorna linhas afetadas. */
export async function applyEventOrders(tx: Prisma.TransactionClient, eventId: string, items: OrderAssignment[]) {
  if (items.length === 0) return 0;
  let total = 0;
  // Lotes de 500 para não ultrapassar o limite de parâmetros do PostgreSQL em listas grandes
  for (let i = 0; i < items.length; i += 500) total += await tx.$executeRaw(buildBulkOrderUpdate(eventId, items.slice(i, i + 500)));
  return total;
}

/**
 * Reordenação por arrastar e soltar. O cliente envia TODOS os patrocinadores do evento na nova ordem;
 * se a lista do cliente estiver desatualizada (alguém cadastrou/excluiu no meio), devolve 409.
 * Custo: 1 SELECT + 1 UPDATE em lote, numa transação.
 */
export async function reorderSponsorships(eventId: string, orderedIds: string[]) {
  if (new Set(orderedIds).size !== orderedIds.length) throw badRequest("Lista com patrocinadores repetidos");
  return prisma.$transaction(async (tx) => {
    const current = await tx.sponsorship.findMany({ where: { eventId }, select: { id: true } });
    const currentIds = new Set(current.map((c) => c.id));
    if (currentIds.size !== orderedIds.length || orderedIds.some((id) => !currentIds.has(id))) {
      throw conflict("A lista mudou desde que você abriu a página. Recarregue e tente de novo.");
    }
    const updated = await applyEventOrders(
      tx,
      eventId,
      orderedIds.map((id, i) => ({ id, eventOrder: i + 1 })),
    );
    if (updated !== orderedIds.length) throw conflict("Não foi possível salvar a ordem. Recarregue e tente de novo.");
    return updated;
  });
}
