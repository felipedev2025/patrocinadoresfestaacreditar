import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, handler, HttpError, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { readUpload } from "@/lib/services/assets";
import { detectListFileKind, parseTabularList } from "@/lib/official-list/parse";
import { readListWithAi } from "@/lib/official-list/ai";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Etapa 1 da importação: lê o arquivo e devolve as linhas para REVISÃO. Nada é gravado aqui.
 * CSV/XLSX são lidos direto; PDF e foto vão para a leitura por IA (com limite de uso).
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  await eventAccess(user, eventId, "list.manage");
  const { file } = await readUpload(req);
  if (file.size > MAX_BYTES) throw badRequest("Arquivo maior que 10 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectListFileKind(buf);
  if (!kind) throw badRequest("Formato não suportado. Envie XLSX, CSV, PDF ou foto (JPG, PNG, WebP).");

  if (kind === "CSV" || kind === "XLSX") {
    const rows = await parseTabularList(buf, kind);
    return NextResponse.json({ source: kind, rows, warnings: [] });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "A leitura por IA não está configurada no servidor (ANTHROPIC_API_KEY). Envie a lista em XLSX ou CSV.");
  }
  // Leitura por IA: limite por usuário e por evento (custo e abuso)
  if (!(await rateLimit(`ai:list:user:${user.id}`, 10, 3600)) || !(await rateLimit(`ai:list:event:${eventId}`, 30, 86400))) {
    throw tooMany("Limite de leituras por IA atingido. Tente novamente mais tarde ou envie uma planilha.");
  }
  const result = await readListWithAi(buf, kind);
  return NextResponse.json({ source: kind, rows: result.rows, warnings: result.warnings });
});
