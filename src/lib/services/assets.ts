import type { AssetKind } from "@prisma/client";
import { createId } from "../ids";
import { prisma } from "../db";
import { env } from "../env";
import { EXT, processLogo } from "../images";
import { keys, storage } from "../storage";
import { badRequest } from "../http";

/**
 * Valida, sanitiza e normaliza uma imagem, gravando original (backup) e PNG processado.
 * O asset nasce "solto" e só passa a valer quando vinculado a um patrocínio/evento;
 * assets órfãos são removidos pela rotina de manutenção do worker.
 */
export async function createImageAsset(input: {
  file: File;
  organizationId: string;
  eventId: string | null;
  kind: AssetKind;
  removeBackground: boolean;
  createdById?: string | null;
  uploadLinkId?: string | null;
  companyId?: string | null;
}) {
  const maxBytes = env().UPLOAD_MAX_MB * 1024 * 1024;
  if (input.file.size > maxBytes) throw badRequest(`Arquivo maior que ${env().UPLOAD_MAX_MB} MB`);
  const buf = Buffer.from(await input.file.arrayBuffer());
  const logo = await processLogo(buf, { removeBackground: input.removeBackground, maxBytes });

  const id = createId();
  const originalKey = keys.assetOriginal(input.organizationId, id, EXT[logo.type]);
  const processedKey = keys.assetProcessed(input.organizationId, id);
  const st = storage();
  await st.put(originalKey, logo.original, logo.mime);
  await st.put(processedKey, logo.processed, "image/png");

  return prisma.mediaAsset.create({
    data: {
      id,
      organizationId: input.organizationId,
      eventId: input.eventId,
      companyId: input.companyId ?? null,
      uploadLinkId: input.uploadLinkId ?? null,
      kind: input.kind,
      originalKey,
      processedKey,
      originalName: input.file.name?.slice(0, 200) || null,
      mimeType: logo.mime,
      sizeBytes: buf.length,
      width: logo.width,
      height: logo.height,
      sha256: logo.sha256,
      backgroundRemoved: logo.backgroundRemoved,
      createdById: input.createdById ?? null,
    },
  });
}

export async function assetPreviewUrl(processedKey: string, ttlSec = 3600) {
  return storage().signedUrl(processedKey, { ttlSec });
}

/** Lê o arquivo de um multipart/form-data validando presença. */
export async function readUpload(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) throw badRequest("Envie o arquivo como multipart/form-data");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Selecione um arquivo de imagem");
  return { file, form };
}
