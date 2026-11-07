import { NextResponse } from "next/server";
import { assertSameOrigin, clientIp, handler, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { resolveUploadLink } from "@/lib/services/upload-links";
import { assetPreviewUrl, createImageAsset, readUpload } from "@/lib/services/assets";

type Ctx = { params: Promise<{ slug: string; token: string }> };

/** Envio público do logotipo (antes da confirmação). Protegido por token + limites por IP e por link. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const { slug, token } = await params;
  const ip = clientIp(req);
  if (!(await rateLimit(`pub:ip:${ip}`, 20, 3600))) throw tooMany();
  const link = await resolveUploadLink(slug, token);
  if (!(await rateLimit(`pub:link:${link.id}`, 15, 3600))) throw tooMany();
  const { file, form } = await readUpload(req);
  const asset = await createImageAsset({
    file,
    organizationId: link.event.organizationId,
    eventId: link.event.id,
    kind: "SPONSOR_LOGO",
    removeBackground: form.get("removeBackground") === "true",
    uploadLinkId: link.id,
  });
  return NextResponse.json({ assetId: asset.id, previewUrl: await assetPreviewUrl(asset.processedKey, 1800) }, { status: 201 });
});
