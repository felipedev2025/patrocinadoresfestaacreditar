import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { writeConferenceWorkbook, type ExportPanelRow, type ExportSlotRow } from "@/lib/official-list/export";

async function* batches<T>(rows: T[], size = 2) {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

const slots: ExportSlotRow[] = [
  { order: 1, listName: "Bland Seguros", seller: "Ana", quotaValue: "1500.00", paymentMethod: "PIX", panelName: "Bland Seguros", status: "OK", hasLogo: true, notes: null },
  { order: 2, listName: "Segatex", seller: "Beto", quotaValue: "800.50", paymentMethod: "Boleto", panelName: "Segato Madeiras", status: "SUGERIDO", hasLogo: false, notes: "confirmar" },
  { order: 3, listName: "=HYPERLINK(\"http://x\")", seller: null, quotaValue: "200.00", paymentMethod: null, panelName: null, status: "FALTA", hasLogo: false, notes: null },
  { order: 4, listName: "Duplicado", seller: null, quotaValue: "999.00", paymentMethod: null, panelName: null, status: "IGNORADO", hasLogo: false, notes: null },
];
const panel: ExportPanelRow[] = [{ name: "Prefeitura de Porto Feliz", category: "Parceiro Institucional", status: "PENDING", hasLogo: false }];

describe("Excel de conferência (streaming)", () => {
  it("gera as abas, colunas, totais e neutraliza fórmulas", async () => {
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise((r) => pass.on("end", r));
    const summary = await writeConferenceWorkbook(pass, { eventName: "Porto Feliz Fest Show 2026", listName: "Lista oficial" }, batches(slots), batches(panel));
    await done;
    expect(summary).toMatchObject({ ok: 1, missing: 1, suggested: 1, onlyInPanel: 1 });
    expect(summary.sum).toBeCloseTo(2500.5); // ignorado fica fora da soma

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Conferência")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Ordem", "Empresa (lista)", "Vendedor", "Valor cota", "Forma Pgto", "Nome no painel", "Status", "Tem logo?", "Observação"]);
    expect(ws.getRow(2).getCell(2).value).toBe("Bland Seguros");
    expect(ws.getRow(2).getCell(4).value).toBe(1500);
    expect(ws.getRow(2).getCell(8).value).toBe("Sim");
    expect(ws.getRow(3).getCell(7).value).toBe("SUGERIDO");
    // texto vindo da lista/IA nunca vira fórmula
    expect(ws.getRow(4).getCell(2).value).toBe("'=HYPERLINK(\"http://x\")");
    const totals = ws.getRow(7);
    expect(totals.getCell(2).value).toBe("TOTAIS");
    expect(totals.getCell(4).value).toBeCloseTo(2500.5);
    expect(String(totals.getCell(6).value)).toContain("OK: 1 · FALTA: 1");

    const ws2 = wb.getWorksheet("Só no painel")!;
    expect(ws2.getRow(2).getCell(1).value).toBe("Prefeitura de Porto Feliz");
    expect(ws2.getRow(2).getCell(3).value).toBe("Pendente");
  });
});
