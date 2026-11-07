import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, clientIp, handler, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { assetPreviewUrl, createImageAsset, readUpload } from "@/lib/services/assets";
import { listAccess } from "@/lib/official-list/access";
import { matchUploadedLogo } from "@/lib/services/official-list";
import { readLogoText } from "@/lib/official-list/ai";
import { audit } from "@/lib/audit";

/**
 * Upload em lote: o navegador envia UM arquivo por requisição (até 50 por lote).
 * O arquivo passa pelo mesmo pipeline de segurança dos logotipos (magic bytes, sharp,
 * EXIF removido, nome gerado no servidor) e é encaixado na lista pelo nome do arquivo.
 * Com "ocr=true", se o nome não ajudar, lê o texto do logo com IA e tenta de novo.
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ listId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { list, access, ctx } = await listAccess(user, (await params).listId, "list.manage");
  if (!(await rateLimit(`listlogos:${user.id}`, 150, 600))) throw tooMany("Muitos envios seguidos. Aguarde alguns minutos.");

  const { file, form } = await readUpload(req);
  const asset = await createImageAsset({
    file,
    organizationId: access.event.organizationId,
    eventId: list.eventId,
    kind: "SPONSOR_LOGO",
    removeBackground: form.get("removeBackground") === "true",
    createdById: user.id,
    importedListId: list.id,
  });

  // O nome original serve APENAS como texto para o match (nunca vira caminho de arquivo)
  const originalName = (file.name || "").slice(0, 200);
  let result = await matchUploadedLogo(ctx, list.id, asset.id, [originalName]);
  let usedOcr = false;
  if (result.kind === "unidentified" && form.get("ocr") === "true") {
    if (await rateLimit(`ai:logo:user:${user.id}`, 60, 3600)) {
      const text = await readLogoText(asset.processedKey).catch(() => null);
      if (text) {
        usedOcr = true;
        result = await matchUploadedLogo(ctx, list.id, asset.id, [text]);
      }
    }
  }

  await audit({
    organizationId: access.event.organizationId,
    eventId: list.eventId,
    userId: user.id,
    action: `list.logo.${result.kind}`,
    entity: "MediaAsset",
    entityId: asset.id,
    data: { listId: list.id, usedOcr, ...(result.kind !== "unidentified" ? { slotId: result.slotId, confidence: result.confidence } : {}) },
    ip: clientIp(req),
  });
  return NextResponse.json({ assetId: asset.id, previewUrl: await assetPreviewUrl(asset.processedKey), usedOcr, result }, { status: 201 });
});
