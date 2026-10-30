import { z } from "zod";

const schema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET deve ter pelo menos 32 caracteres"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("patrocinios"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default("true"),
  UPLOAD_MAX_MB: z.coerce.number().positive().max(50).default(10),
  NODE_ENV: z.string().default("development"),
});

let cached: z.infer<typeof schema> | null = null;

/** Lê e valida variáveis de ambiente uma única vez (falha rápido em configuração inválida). */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Configuração inválida: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
