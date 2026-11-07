import { z } from "zod";

export const MAX_LIST_ROWS = 1000;

/** Texto livre vindo de planilha / OCR: remove controles e limita tamanho. Nunca é interpretado como HTML. */
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

const optText = (max: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? "" : String(v)))
    .pipe(text(max))
    .transform((s) => (s ? s : null));

/** Valor monetário normalizado como string decimal "1500.00" (evita erro de ponto flutuante). */
export const moneySchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const parsed = parseMoney(v);
    if (parsed === undefined) {
      ctx.addIssue({ code: "custom", message: `Valor de cota inválido: "${String(v).slice(0, 30)}"` });
      return z.NEVER;
    }
    return parsed;
  });

export const officialRowSchema = z.object({
  order: z.coerce.number().int().min(1).max(5000),
  company: text(160).pipe(z.string().min(1, "Nome da empresa obrigatório")),
  seller: optText(100),
  quotaValue: moneySchema,
  paymentMethod: optText(60),
  notes: optText(300),
});

export type OfficialRow = z.infer<typeof officialRowSchema>;

export const officialRowsSchema = z
  .array(officialRowSchema)
  .min(1, "A lista está vazia")
  .max(MAX_LIST_ROWS, `Máximo de ${MAX_LIST_ROWS} linhas por lista`)
  .superRefine((rows, ctx) => {
    const seen = new Set<number>();
    rows.forEach((r, i) => {
      if (seen.has(r.order)) ctx.addIssue({ code: "custom", path: [i, "order"], message: `Ordem ${r.order} repetida` });
      seen.add(r.order);
    });
  });

/**
 * "R$ 1.500,00" → "1500.00" · "1500" → "1500.00" · "1,5 mil" → undefined (ambíguo) · "" → null
 * Aceita formato brasileiro e internacional. Retorna undefined quando não reconhece.
 */
export function parseMoney(v: string | number): string | null | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v < 1e10 ? v.toFixed(2) : undefined;
  let s = v.replace(/r\$|\s/gi, "").replace(/,-+$|\.-+$/, "").trim();
  if (!s || s === "-") return null;
  if (!/^\d[\d.,]*$/.test(s)) return undefined;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // o separador que aparece por último é o decimal: "1.500,00" (BR) ou "1,500.00" (US)
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ""); // "1,500" / "1,500,000" = milhar
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", "."); // "1500,5" / "1500,50" = decimal
    else return undefined;
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.500" = milhar (padrão BR)
    else if (!/^\d+\.\d{1,2}$/.test(s)) return undefined; // "1500.50" = decimal
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? n.toFixed(2) : undefined;
}
