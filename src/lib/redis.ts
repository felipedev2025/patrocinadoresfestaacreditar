import { Redis } from "ioredis";

const g = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (!g.redis) {
    // Cliente só para rate limit: se o Redis cair, os comandos falham na hora (sem fila offline)
    // e rateLimit() libera a requisição, em vez de deixar login e uploads esperando indefinidamente.
    // A fila de vídeos (BullMQ) usa conexões próprias, em src/lib/queue.ts.
    g.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      lazyConnect: false,
    });
    g.redis.on("error", (err) => console.error("[redis] indisponível:", err.message));
  }
  return g.redis;
}

/** Janela fixa simples em Redis. Retorna false quando o limite é excedido. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const k = `rl:${key}`;
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, windowSec);
    return n <= limit;
  } catch (err) {
    // Falha do Redis não deve derrubar a aplicação; registra e permite.
    console.error("[rate-limit] redis indisponível", err);
    return true;
  }
}
