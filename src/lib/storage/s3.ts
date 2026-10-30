import { createWriteStream, promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey, type StorageDriver } from "./types";

/** Driver para qualquer storage compatível com S3 (AWS, MinIO, Cloudflare R2, Wasabi...). */
export class S3Storage implements StorageDriver {
  private client: S3Client;
  /** Cliente usado só para assinar URLs: aponta para o endereço público (o navegador não alcança o endpoint interno). */
  private signer: S3Client;

  constructor(
    private bucket: string,
    cfg: { endpoint?: string; publicEndpoint?: string; region: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean },
  ) {
    const make = (endpoint?: string) =>
      new S3Client({
        endpoint: endpoint || undefined,
        region: cfg.region,
        forcePathStyle: cfg.forcePathStyle,
        credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
      });
    this.client = make(cfg.endpoint);
    this.signer = cfg.publicEndpoint ? make(cfg.publicEndpoint) : this.client;
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key), Body: body, ContentType: contentType }));
  }

  async putFile(key: string, filePath: string, contentType: string) {
    const stat = await fs.stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        Body: createReadStream(filePath),
        ContentLength: stat.size,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async download(key: string, dest: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(res.Body as Readable, createWriteStream(dest));
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
      return true;
    } catch {
      return false;
    }
  }

  signedUrl(key: string, opts: { ttlSec?: number; downloadName?: string } = {}) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        ResponseContentDisposition: opts.downloadName ? `attachment; filename="${opts.downloadName.replace(/"/g, "")}"` : undefined,
      }),
      { expiresIn: opts.ttlSec ?? 3600 },
    );
  }
}
