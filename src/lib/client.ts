"use client";

/** fetch JSON com tratamento padronizado de erro para os componentes cliente. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data?.details) ? ": " + data.details.map((d: { message: string }) => d.message).join("; ") : "";
    throw new Error((data?.error ?? `Erro ${res.status}`) + details);
  }
  return data as T;
}
