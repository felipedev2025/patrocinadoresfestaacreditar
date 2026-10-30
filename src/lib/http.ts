import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = "Não autenticado") => new HttpError(401, m);
export const forbidden = (m = "Sem permissão para esta operação") => new HttpError(403, m);
export const notFound = (m = "Não encontrado") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
export const tooMany = (m = "Muitas tentativas. Aguarde alguns minutos.") => new HttpError(429, m);

/** Envolve um route handler padronizando erros em JSON e evitando vazar detalhes internos. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Dados inválidos", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 422 },
        );
      }
      console.error("[api] erro inesperado", err);
      return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
    }
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Proteção CSRF para requisições que alteram estado: o cookie de sessão é SameSite=Lax
 * e, adicionalmente, exigimos que Origin (quando presente) seja o próprio host.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw forbidden("Origem da requisição não permitida");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw forbidden("Origem inválida");
  }
}
