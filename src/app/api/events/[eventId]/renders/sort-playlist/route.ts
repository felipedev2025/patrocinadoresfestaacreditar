import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, handler } from "@/lib/http";
import { audit } from "@/lib/audit";

/**
 * Reordena a playlist do telão pela ordem do evento:
 * vídeos coletivos e por categoria ficam primeiro (na ordem atual); depois os individuais,
 * na ordem manual dos patrocinadores (sem ordem → fim, em A–Z). Um único UPDATE em lote.
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "screen.operate");

  const published = await prisma.videoRender.findMany({
    where: { eventId, published: true },
    select: { id: true, kind: true, publishOrder: true, sponsorship: { select: { eventOrder: true, displayName: true } } },
    orderBy: { publishOrder: "asc" },
  });
  if (published.length === 0) throw badRequest("Nenhum vídeo publicado no telão");

  const groups = published.filter((r) => r.kind !== "INDIVIDUAL");
  const individuals = published
    .filter((r) => r.kind === "INDIVIDUAL")
    .sort(
      (a, b) =>
        (a.sponsorship?.eventOrder ?? Infinity) - (b.sponsorship?.eventOrder ?? Infinity) ||
        (a.sponsorship?.displayName ?? "").localeCompare(b.sponsorship?.displayName ?? "", "pt-BR"),
    );
  const ordered = [...groups, ...individuals];

  const values = Prisma.join(ordered.map((r, i) => Prisma.sql`(${r.id}, ${i + 1}::int)`));
  const updated = await prisma.$executeRaw`
    UPDATE "VideoRender" AS r SET "publishOrder" = v.ord
      FROM (VALUES ${values}) AS v(id, ord)
     WHERE r."id" = v.id AND r."eventId" = ${eventId}`;

  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "render.sortPlaylist", entity: "VideoRender", data: { count: updated }, ip: clientIp(req) });
  return NextResponse.json({ updated });
});
