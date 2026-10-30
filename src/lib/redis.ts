import { Redis } from "ioredis";

const g = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (!g.redis) {
    g.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
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
