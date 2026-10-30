import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { storage } from "@/lib/storage";
import { LocalStorage } from "@/lib/storage/local";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4" };

/**
 * Entrega de arquivos do driver local com URL assinada (HMAC + expiração).
 * Suporta Range (necessário para <video> e para retomar downloads no telão).
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const st = storage();
  if (!(st instanceof LocalStorage)) return new Response("Not found", { status: 404 });
  const key = (await params).key.join("/");
  const url = new URL(req.url);
  const dl = url.searchParams.get("dl") ?? "";
  let path: string;
  try {
    if (!st.verify(key, url.searchParams.get("exp") ?? "", url.searchParams.get("sig") ?? "", dl)) return new Response("Forbidden", { status: 403 });
    path = st.filePath(key);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  let size: number;
  try {
    size = (await fs.stat(path)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const ext = key.split(".").pop()!.toLowerCase();
  const headers = new Headers({
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    // SVG original nunca é renderizado inline como documento (mitiga XSS residual)
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  });
  if (dl) headers.set("Content-Disposition", `attachment; filename="${dl.replace(/[^\w.\-]/g, "_")}"`);

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { status: 200, headers });
}
