import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, handler, tooMany } from "@/lib/http";
import { assetPreviewUrl, createImageAsset, readUpload } from "@/lib/services/assets";
import { rateLimit } from "@/lib/redis";

/**
 * Etapa 1 do cadastro: envia o logotipo, que é validado, sanitizado e normalizado.
 * Retorna o id do asset e a URL da prévia processada (antes de salvar o patrocinador).
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "sponsorship.create");
  if (!(await rateLimit(`upload:user:${user.id}`, 60, 600))) throw tooMany();
  const { file, form } = await readUpload(req);
  const asset = await createImageAsset({
    file,
    organizationId: access.event.organizationId,
    eventId,
    kind: "SPONSOR_LOGO",
    removeBackground: form.get("removeBackground") === "true",
    createdById: user.id,
  });
  return NextResponse.json(
    {
      assetId: asset.id,
      previewUrl: await assetPreviewUrl(asset.processedKey),
      width: asset.width,
      height: asset.height,
      backgroundRemoved: asset.backgroundRemoved,
    },
    { status: 201 },
  );
});
