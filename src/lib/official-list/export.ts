import ExcelJS from "exceljs";
import type { Writable } from "node:stream";

export type ExportSlotRow = {
  order: number;
  listName: string;
  seller: string | null;
  quotaValue: string | null; // decimal como string ("1500.00")
  paymentMethod: string | null;
  panelName: string | null;
  status: "OK" | "FALTA" | "SUGERIDO" | "IGNORADO";
  hasLogo: boolean;
  notes: string | null;
};

export type ExportPanelRow = { name: string; category: string | null; status: string; hasLogo: boolean };

const STATUS_FILL: Record<ExportSlotRow["status"], string> = { OK: "FFC6EFCE", FALTA: "FFFFC7CE", SUGERIDO: "FFFFEB9C", IGNORADO: "FFE7E6E6" };
const PANEL_STATUS: Record<string, string> = { PENDING: "Pendente", APPROVED: "Aprovado", REJECTED: "Rejeitado", ARCHIVED: "Arquivado" };

/** Excel abre como fórmula o texto que começa com estes caracteres em alguns fluxos (copiar/colar, CSV). */
const safeText = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : (v ?? ""));

/**
 * Gera o Excel de conferência em STREAMING (ExcelJS WorkbookWriter): as linhas são escritas e
 * descartadas da memória à medida que chegam dos iteradores, sem montar a planilha inteira.
 */
export async function writeConferenceWorkbook(
  out: Writable,
  meta: { eventName: string; listName: string },
  slots: AsyncIterable<ExportSlotRow[]>,
  panel: AsyncIterable<ExportPanelRow[]>,
) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  wb.creator = "Patrocínios & Telão";
  wb.created = new Date();

  const ws = wb.addWorksheet("Conferência", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Ordem", key: "order", width: 8 },
    { header: "Empresa (lista)", key: "listName", width: 34 },
    { header: "Vendedor", key: "seller", width: 20 },
    { header: "Valor cota", key: "quotaValue", width: 14, style: { numFmt: '"R$" #,##0.00' } },
    { header: "Forma Pgto", key: "paymentMethod", width: 16 },
    { header: "Nome no painel", key: "panelName", width: 34 },
    { header: "Status", key: "status", width: 11 },
    { header: "Tem logo?", key: "hasLogo", width: 10 },
    { header: "Observação", key: "notes", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();

  let sum = 0;
  let ok = 0;
  let missing = 0;
  let suggested = 0;
  for await (const batch of slots) {
    for (const s of batch) {
      if (s.status !== "IGNORADO" && s.quotaValue) sum += Number(s.quotaValue);
      if (s.status === "OK") ok++;
      else if (s.status === "FALTA") missing++;
      else if (s.status === "SUGERIDO") suggested++;
      const row = ws.addRow({
        order: s.order,
        listName: safeText(s.listName),
        seller: safeText(s.seller),
        quotaValue: s.quotaValue ? Number(s.quotaValue) : null,
        paymentMethod: safeText(s.paymentMethod),
        panelName: safeText(s.panelName),
        status: s.status,
        hasLogo: s.hasLogo ? "Sim" : "Não",
        notes: safeText(s.notes),
      });
      row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[s.status] } };
      row.commit();
    }
  }
  ws.addRow({}).commit();
  const totals = ws.addRow({
    listName: "TOTAIS",
    quotaValue: Math.round(sum * 100) / 100,
    panelName: `OK: ${ok} · FALTA: ${missing} · SUGERIDO: ${suggested}`,
  });
  totals.font = { bold: true };
  totals.commit();
  ws.commit();

  const ws2 = wb.addWorksheet("Só no painel", { views: [{ state: "frozen", ySplit: 1 }] });
  ws2.columns = [
    { header: "Patrocinador no painel", key: "name", width: 36 },
    { header: "Categoria", key: "category", width: 24 },
    { header: "Status", key: "status", width: 12 },
    { header: "Tem logo?", key: "hasLogo", width: 10 },
  ];
  ws2.getRow(1).font = { bold: true };
  ws2.getRow(1).commit();
  let only = 0;
  for await (const batch of panel) {
    for (const p of batch) {
      only++;
      ws2.addRow({ name: safeText(p.name), category: safeText(p.category), status: PANEL_STATUS[p.status] ?? p.status, hasLogo: p.hasLogo ? "Sim" : "Não" }).commit();
    }
  }
  ws2.addRow({}).commit();
  const t2 = ws2.addRow({ name: `TOTAL: ${only} patrocinador(es) fora da lista oficial` });
  t2.font = { bold: true };
  t2.commit();
  ws2.commit();

  const sheet = wb.addWorksheet("Info");
  sheet.addRow(["Evento", meta.eventName]).commit();
  sheet.addRow(["Lista", meta.listName]).commit();
  sheet.addRow(["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })]).commit();
  sheet.commit();

  await wb.commit();
  return { ok, missing, suggested, sum, onlyInPanel: only };
}
