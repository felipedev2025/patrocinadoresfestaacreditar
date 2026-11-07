import { Queue } from "bullmq";

export const RENDER_QUEUE = "video-render";
export const MAINTENANCE_QUEUE = "maintenance";

export type RenderJobData = { renderId: string };

function connection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export const redisConnection = connection;

const g = globalThis as unknown as { renderQueue?: Queue<RenderJobData> };

export function renderQueue(): Queue<RenderJobData> {
  if (!g.renderQueue) {
    g.renderQueue = new Queue<RenderJobData>(RENDER_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: { age: 7 * 86400, count: 1000 },
        removeOnFail: { age: 30 * 86400 },
      },
    });
  }
  return g.renderQueue;
}

/** Enfileira usando o id do render como jobId: idempotente (não duplica o mesmo render). */
export async function enqueueRender(renderId: string) {
  await renderQueue().add("render", { renderId }, { jobId: renderId });
}
