import ExcelJS from "exceljs";
import { detectImageType } from "../images";
import { badRequest } from "../http";
import { MAX_LIST_ROWS } from "./schema";

export type ListFileKind = "CSV" | "XLSX" | "PDF" | "IMAGE";

/** Linha crua, antes da validação/revisão (todos os campos como texto). */
export type RawRow = {
  order: number;
  company: string;
  seller: string;
  quotaValue: string;
  paymentMethod: string;
  notes: string;
};

/** Detecta o tipo pelo conteúdo (magic bytes). A extensão e o Content-Type do cliente são ignorados. */
export function detectListFileKind(buf: Buffer): ListFileKind | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "XLSX"; // ZIP (OOXML)
  if (buf.toString("latin1", 0, 5) === "%PDF-") return "PDF";
  const img = detectImageType(buf);
  if (img === "png" || img === "jpeg" || img === "webp") return "IMAGE";
  if (img === "svg") return null;
  // CSV: texto sem bytes nulos e sem outros caracteres de controle binários
  const head = buf.subarray(0, Math.min(buf.length, 8192));
  for (const b of head) if (b === 0 || (b < 0x09) || (b > 0x0d && b < 0x20 && b !== 0x1b)) return null;
  return "CSV";
}

/** Decodifica CSV em UTF-8; se houver bytes inválidos, assume Windows-1252 (Excel em português). */
export function decodeText(buf: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
  return text.replace(/^﻿/, "");
}

/** Parser CSV (RFC 4180): aspas, aspas escapadas, quebras de linha dentro de campos; ; ou , ou tab. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 } as Record<string, number>;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]!++;
  }
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0] : ";") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length > MAX_LIST_ROWS + 5) throw badRequest(`Máximo de ${MAX_LIST_ROWS} linhas por lista`);
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    if ("hyperlink" in v) return String((v as { hyperlink: unknown }).hyperlink ?? "");
  }
  return "";
}

/** Lê a primeira planilha com conteúdo. Fórmulas entram pelo valor calculado (nunca são executadas). */
export async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw badRequest("Planilha XLSX inválida ou corrompida");
  }
  const sheet = wb.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw badRequest("A planilha está vazia");
  if (sheet.actualRowCount > MAX_LIST_ROWS + 5) throw badRequest(`Máximo de ${MAX_LIST_ROWS} linhas por lista`);
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const count = Math.min(row.cellCount, 30);
    for (let c = 1; c <= count; c++) values.push(cellText(row.getCell(c).value).trim());
    if (values.some((x) => x)) rows.push(values);
  });
  return rows;
}

const HEADER_ALIASES: Record<keyof Omit<RawRow, "order"> | "order", RegExp> = {
  order: /^(ordem|ord|n|no|num|numero|item|#|posicao|pos|seq)$/,
  company: /^(empresa|patrocinador|nome|razao social|nome fantasia|cliente|anunciante|marca)$/,
  seller: /^(vendedor|captador|responsavel|vendido por|vend)$/,
  quotaValue: /^(valor|cota|valor cota|valor da cota|valor r|preco|investimento|valor total)$/,
  paymentMethod: /^(forma pgto|forma de pagamento|pagamento|pgto|forma pagto|forma pag|forma)$/,
  notes: /^(observacao|observacoes|obs|nota|notas|comentario)$/,
};

function normHeader(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte a tabela em linhas, identificando as colunas pelo cabeçalho (sinônimos em português).
 * Sem cabeçalho reconhecível, assume a ordem: Ordem, Empresa, Vendedor, Valor, Forma Pgto, Observação.
 * Sem coluna de ordem, usa a posição da linha (preserva a ordem da lista).
 */
export function rowsToRaw(table: string[][]): RawRow[] {
  if (table.length === 0) return [];
  const header = table[0]!.map(normHeader);
  const map: Partial<Record<keyof RawRow, number>> = {};
  header.forEach((h, i) => {
    for (const [key, re] of Object.entries(HEADER_ALIASES)) {
      if (map[key as keyof RawRow] === undefined && re.test(h)) map[key as keyof RawRow] = i;
    }
  });
  const hasHeader = map.company !== undefined;
  let body = table;
  if (hasHeader) body = table.slice(1);
  else {
    // sem cabeçalho: se a 1ª coluna for numérica, é a ordem
    const firstNumeric = table.every((r) => /^\d+$/.test((r[0] ?? "").trim()));
    Object.assign(map, firstNumeric ? { order: 0, company: 1, seller: 2, quotaValue: 3, paymentMethod: 4, notes: 5 } : { company: 0, seller: 1, quotaValue: 2, paymentMethod: 3, notes: 4 });
  }
  const get = (r: string[], k: keyof RawRow) => (map[k] !== undefined ? (r[map[k]!] ?? "").trim() : "");
  const out: RawRow[] = [];
  body.forEach((r, i) => {
    const company = get(r, "company");
    if (!company) return;
    const ord = parseInt(get(r, "order").replace(/\D/g, ""), 10);
    out.push({
      order: Number.isFinite(ord) && ord > 0 ? ord : i + 1,
      company,
      seller: get(r, "seller"),
      quotaValue: get(r, "quotaValue"),
      paymentMethod: get(r, "paymentMethod"),
      notes: get(r, "notes"),
    });
  });
  // ordens repetidas ou ausentes: renumera preservando a sequência de leitura
  const orders = new Set(out.map((r) => r.order));
  if (orders.size !== out.length) out.forEach((r, i) => (r.order = i + 1));
  return out.sort((a, b) => a.order - b.order);
}

export async function parseTabularList(buf: Buffer, kind: "CSV" | "XLSX"): Promise<RawRow[]> {
  const table = kind === "XLSX" ? await parseXlsx(buf) : parseCsv(decodeText(buf));
  const rows = rowsToRaw(table);
  if (rows.length === 0) throw badRequest("Nenhuma linha com nome de empresa foi encontrada");
  if (rows.length > MAX_LIST_ROWS) throw badRequest(`Máximo de ${MAX_LIST_ROWS} linhas por lista`);
  return rows;
}
