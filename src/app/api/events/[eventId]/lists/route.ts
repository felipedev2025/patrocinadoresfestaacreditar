import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, handler } from "@/lib/http";
import { officialRowsSchema } from "@/lib/official-list/schema";
import { detectListFileKind } from "@/lib/official-list/parse";
import { commitList } from "@/lib/services/official-list";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ eventId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  await eventAccess(user, eventId, "list.export");
  const lists = await prisma.importedList.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, source: true, createdAt: true, createdBy: { select: { name: true } }, _count: { select: { slots: true } } },
  });
  return NextResponse.json({ lists });
});

const payloadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  rows: officialRowsSchema,
});

/**
 * Etapa 2: grava a lista REVISADA pelo organizador (multipart: "payload" JSON + "file" original opcional).
 * O tipo do arquivo é revalidado pelos magic bytes; o nome original nunca é usado no armazenamento.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "list.manage");
  const form = await req.formData();
  const raw = form.get("payload");
  if (typeof raw !== "string" || raw.length > 2_000_000) throw badRequest("Dados da lista ausentes");
  const payload = payloadSchema.parse(JSON.parse(raw));

  let buf: Buffer | null = null;
  let source: "CSV" | "XLSX" | "PDF" | "IMAGE" = "CSV";
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) throw badRequest("Arquivo maior que 10 MB");
    buf = Buffer.from(await file.arrayBuffer());
    const kind = detectListFileKind(buf);
    if (!kind) throw badRequest("Formato de arquivo não suportado");
    source = kind;
  }

  const result = await commitList({ organizationId: access.event.organizationId, eventId, userId: user.id }, { name: payload.name, source, file: buf, rows: payload.rows });
  await audit({
    organizationId: access.event.organizationId,
    eventId,
    userId: user.id,
    action: "list.import",
    entity: "ImportedList",
    entityId: result.listId,
    data: { total: result.total, linked: result.linked, suggested: result.suggested, source },
    ip: clientIp(req),
  });
  return NextResponse.json(result, { status: 201 });
});
