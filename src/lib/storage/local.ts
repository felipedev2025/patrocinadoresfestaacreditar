import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { hmac, safeEqual } from "../crypto";
import { assertSafeKey, type StorageDriver } from "./types";

/**
 * Driver de disco local. As URLs são servidas por /api/files/[...key] com assinatura HMAC
 * e expiração, equivalentes a URLs pré-assinadas do S3.
 */
export class LocalStorage implements StorageDriver {
  constructor(private baseDir: string, private secret: string, private appUrl: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.baseDir, assertSafeKey(key));
    if (!full.startsWith(path.resolve(this.baseDir) + path.sep)) throw new Error("Caminho fora do storage");
    return full;
  }

  async put(key: string, body: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }

  async putFile(key: string, filePath: string) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.copyFile(filePath, p);
  }

  get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async download(key: string, dest: string) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(createReadStream(this.resolve(key)), createWriteStream(dest));
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  filePath(key: string) {
    return this.resolve(key);
  }

  async signedUrl(key: string, opts: { ttlSec?: number; downloadName?: string } = {}) {
    const exp = Math.floor(Date.now() / 1000) + (opts.ttlSec ?? 3600);
    const dl = opts.downloadName ?? "";
    const sig = hmac(this.secret, `${assertSafeKey(key)}|${exp}|${dl}`);
    const qs = new URLSearchParams({ exp: String(exp), sig });
    if (dl) qs.set("dl", dl);
    return `/api/files/${key}?${qs.toString()}`;
  }

  verify(key: string, exp: string, sig: string, dl: string) {
    const expN = Number(exp);
    if (!Number.isFinite(expN) || expN < Date.now() / 1000) return false;
    return safeEqual(hmac(this.secret, `${key}|${expN}|${dl}`), sig);
  }
}
