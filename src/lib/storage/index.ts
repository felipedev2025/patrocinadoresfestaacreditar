import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageDriver } from "./types";

export type { StorageDriver } from "./types";
export { assertSafeKey } from "./types";

const g = globalThis as unknown as { storage?: StorageDriver };

/** Instância única do driver configurado em STORAGE_DRIVER. Funciona no app web e no worker. */
export function storage(): StorageDriver {
  if (!g.storage) {
    const driver = process.env.STORAGE_DRIVER ?? "local";
    if (driver === "s3") {
      g.storage = new S3Storage(process.env.S3_BUCKET ?? "patrocinios", {
        endpoint: process.env.S3_ENDPOINT,
        publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
        region: process.env.S3_REGION ?? "us-east-1",
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
        forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
      });
    } else {
      const secret = process.env.APP_SECRET;
      if (!secret) throw new Error("APP_SECRET não configurado");
      g.storage = new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? "./storage", secret, process.env.APP_URL ?? "");
    }
  }
  return g.storage;
}

/** Organização das chaves por organização / evento / edição. */
export const keys = {
  assetOriginal: (orgId: string, assetId: string, ext: string) => `orgs/${orgId}/assets/${assetId}/original.${ext}`,
  assetProcessed: (orgId: string, assetId: string) => `orgs/${orgId}/assets/${assetId}/processed.png`,
  renderVideo: (orgId: string, eventId: string, renderId: string) => `orgs/${orgId}/events/${eventId}/renders/${renderId}/video.mp4`,
  listFile: (orgId: string, eventId: string, listId: string, ext: string) => `orgs/${orgId}/events/${eventId}/lists/${listId}.${ext}`,
  renderThumb: (orgId: string, eventId: string, renderId: string) => `orgs/${orgId}/events/${eventId}/renders/${renderId}/thumb.jpg`,
};
