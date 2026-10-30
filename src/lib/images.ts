import sharp, { type Sharp, type Metadata } from "sharp";
import { sha256 } from "./crypto";
import { badRequest } from "./http";

export type DetectedType = "png" | "jpeg" | "webp" | "svg";

export const ACCEPTED_MIME: Record<DetectedType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const MAX_PIXELS = 40_000_000; // proteção contra "decompression bombs"
const OUTPUT_MAX = 1600; // lado máximo do PNG normalizado usado nos vídeos

/** Detecta o tipo pelo conteúdo (magic bytes), nunca pela extensão ou Content-Type do cliente. */
export function detectImageType(buf: Buffer): DetectedType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  const head = buf.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")) || (head.startsWith("<!--") && head.includes("<svg"))) {
    return "svg";
  }
  return null;
}

/**
 * Sanitiza SVG removendo scripts, handlers de eventos, foreignObject, referências externas
 * e declarações DOCTYPE/ENTITY (XXE / "billion laughs").
 */
export async function sanitizeSvg(raw: string): Promise<string> {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw badRequest("SVG com DOCTYPE/ENTITY não é permitido");
  const { JSDOM } = await import("jsdom");
  const createDOMPurify = (await import("dompurify")).default;
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
  purify.addHook("afterSanitizeAttributes", (node) => {
    for (const attr of ["href", "xlink:href"]) {
      const v = node.getAttribute?.(attr);
      // Só permite referências internas (#id) ou imagens embutidas raster.
      if (v && !v.startsWith("#") && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v)) node.removeAttribute(attr);
    }
    const style = node.getAttribute?.("style");
    if (style && /url\s*\(\s*['"]?(?!#)/i.test(style)) node.removeAttribute("style");
  });
  const clean = purify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "embed", "object", "audio", "video", "animate", "set"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover"],
  });
  window.close();
  if (!clean || !/<svg[\s>]/i.test(clean)) throw badRequest("SVG inválido ou vazio após sanitização");
  return clean;
}

/**
 * Remove fundo uniforme (branco ou cor sólida) por preenchimento a partir das bordas.
 * Não depende de serviços externos; funciona muito bem para logotipos "chapados".
 * Retorna null se a borda não tiver uma cor de fundo dominante.
 */
export function removeUniformBackground(data: Buffer, width: number, height: number, tolerance = 38): Buffer | null {
  const px = (x: number, y: number) => (y * width + x) * 4;
  const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
  const opaque = corners.filter((i) => data[i + 3]! > 200);
  if (opaque.length < 3) return null; // já tem transparência nas bordas
  const avg = [0, 1, 2].map((c) => opaque.reduce((s, i) => s + data[i + c]!, 0) / opaque.length);
  const dist = (i: number) =>
    Math.sqrt((data[i]! - avg[0]!) ** 2 + (data[i + 1]! - avg[1]!) ** 2 + (data[i + 2]! - avg[2]!) ** 2);
  if (opaque.some((i) => dist(i) > tolerance)) return null; // cantos com cores diferentes: não é fundo sólido

  const out = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (!visited[p]) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const p = queue[head++]!;
    const i = p * 4;
    const d = dist(i);
    if (d >= tolerance * 1.8) continue;
    // Borda suave: transição de alfa entre tolerance e 1.8*tolerance
    out[i + 3] = d < tolerance ? 0 : Math.min(out[i + 3]!, Math.round(((d - tolerance) / (tolerance * 0.8)) * 255));
    if (d >= tolerance) continue;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return out;
}

export type ProcessedLogo = {
  type: DetectedType;
  mime: string;
  original: Buffer; // para SVG, a versão sanitizada
  processed: Buffer; // PNG com transparência, recortado e normalizado
  width: number;
  height: number;
  sha256: string;
  backgroundRemoved: boolean;
};

export async function processLogo(input: Buffer, opts: { removeBackground?: boolean; maxBytes: number }): Promise<ProcessedLogo> {
  if (input.length === 0) throw badRequest("Arquivo vazio");
  if (input.length > opts.maxBytes) throw badRequest(`Arquivo maior que ${Math.round(opts.maxBytes / 1048576)} MB`);
  const type = detectImageType(input);
  if (!type) throw badRequest("Formato não suportado. Envie PNG, JPG, SVG ou WebP.");

  let original = input;
  let pipeline: Sharp;
  if (type === "svg") {
    const clean = await sanitizeSvg(input.toString("utf8"));
    original = Buffer.from(clean, "utf8");
    pipeline = sharp(original, { density: 300, limitInputPixels: MAX_PIXELS });
  } else {
    pipeline = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" });
  }

  let meta: Metadata;
  try {
    meta = await pipeline.metadata();
  } catch {
    throw badRequest("Imagem corrompida ou inválida");
  }
  if (!meta.width || !meta.height) throw badRequest("Imagem sem dimensões válidas");
  if (type !== "svg" && (meta.width < 64 || meta.height < 64)) {
    throw badRequest("Logotipo muito pequeno (mínimo 64 × 64 px). Envie uma versão maior.");
  }

  // 1) Orientação EXIF, alfa e redução para o tamanho de trabalho
  const { data, info } = await pipeline
    .rotate()
    .resize(OUTPUT_MAX, OUTPUT_MAX, { fit: "inside", withoutEnlargement: type !== "svg" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2) Remoção opcional de fundo sólido
  let pixels: Buffer = data;
  let backgroundRemoved = false;
  if (opts.removeBackground) {
    const removed = removeUniformBackground(data, info.width, info.height);
    if (removed) {
      pixels = removed;
      backgroundRemoved = true;
    }
  }

  // 3) Recorte automático das bordas vazias (centraliza e corrige proporção no template)
  let img = sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } });
  try {
    const trimmed = await img.clone().trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
    if (trimmed.info.width >= 16 && trimmed.info.height >= 16) img = sharp(trimmed.data);
  } catch {
    // imagem uniforme: mantém sem recorte
  }

  const out = await img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true });

  return {
    type,
    mime: ACCEPTED_MIME[type],
    original,
    processed: out.data,
    width: out.info.width,
    height: out.info.height,
    sha256: sha256(input),
    backgroundRemoved,
  };
}

export const EXT: Record<DetectedType, string> = { png: "png", jpeg: "jpg", webp: "webp", svg: "svg" };
