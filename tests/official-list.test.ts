import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { decodeText, detectListFileKind, parseCsv, parseTabularList, rowsToRaw } from "@/lib/official-list/parse";
import { officialRowsSchema, parseMoney } from "@/lib/official-list/schema";

describe("valor da cota", () => {
  it.each([
    ["R$ 1.500,00", "1500.00"],
    ["1.500", "1500.00"],
    ["1,500", "1500.00"],
    ["1500,5", "1500.50"],
    ["1500.50", "1500.50"],
    ["R$ 5.000,-", "5000.00"],
    ["1.234.567,89", "1234567.89"],
    ["", null],
  ])("%s → %s", (input, expected) => expect(parseMoney(input)).toBe(expected));
  it("recusa valores ambíguos em vez de chutar", () => {
    expect(parseMoney("5 mil")).toBeUndefined();
    expect(parseMoney("12,3456")).toBeUndefined();
  });
});

describe("detecção do tipo de arquivo pelo conteúdo", () => {
  it("reconhece XLSX (zip), PDF e CSV; recusa binário e SVG", () => {
    expect(detectListFileKind(Buffer.from("PK\x03\x04restodozip"))).toBe("XLSX");
    expect(detectListFileKind(Buffer.from("%PDF-1.7\n..."))).toBe("PDF");
    expect(detectListFileKind(Buffer.from("Ordem;Empresa\n1;Acme\n"))).toBe("CSV");
    expect(detectListFileKind(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull(); // executável
    expect(detectListFileKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
});

describe("CSV", () => {
  it("lê ; com aspas, quebra de linha no campo e cabeçalho em português", () => {
    const csv = 'Nº;Empresa;Vendedor;Valor Cota;Forma Pgto;Obs\n1;"Bland Seguros";Ana;"R$ 1.500,00";PIX;\n2;"Porto ""Net""";Beto;800;Boleto;"pago\nmetade"\n';
    const rows = rowsToRaw(parseCsv(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ order: 1, company: "Bland Seguros", seller: "Ana", quotaValue: "R$ 1.500,00", paymentMethod: "PIX" });
    expect(rows[1]!.company).toBe('Porto "Net"');
    expect(rows[1]!.notes).toBe("pago\nmetade");
  });
  it("aceita CSV do Excel em Windows-1252 (acentos)", () => {
    const latin1 = Buffer.from("Empresa;Vendedor\nPadaria Pão Quente;João\n", "latin1");
    const rows = rowsToRaw(parseCsv(decodeText(latin1)));
    expect(rows[0]).toMatchObject({ order: 1, company: "Padaria Pão Quente", seller: "João" });
  });
  it("sem cabeçalho e sem coluna de ordem, preserva a ordem das linhas", () => {
    const rows = rowsToRaw(parseCsv("Segatex,Ana\nSegato Madeiras,Beto\n"));
    expect(rows.map((r) => [r.order, r.company])).toEqual([[1, "Segatex"], [2, "Segato Madeiras"]]);
  });
});

describe("XLSX", () => {
  it("lê a primeira planilha com valores numéricos e texto", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lista");
    ws.addRow(["Ordem", "Empresa", "Vendedor", "Valor", "Forma de pagamento"]);
    ws.addRow([2, "R&C Eletritec", "Ana", 1200, "Cartão"]);
    ws.addRow([1, "Bland Seguros", "Beto", 2500.5, "PIX"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(detectListFileKind(buf)).toBe("XLSX");
    const rows = await parseTabularList(buf, "XLSX");
    expect(rows.map((r) => [r.order, r.company, r.quotaValue])).toEqual([
      [1, "Bland Seguros", "2500.5"],
      [2, "R&C Eletritec", "1200"],
    ]);
  });
});

describe("validação da revisão", () => {
  it("normaliza dinheiro, remove controles e recusa ordem repetida", () => {
    const ok = officialRowsSchema.parse([{ order: 1, company: "  Bland\u0007 Seguros ", seller: "", quotaValue: "R$ 1.500,00", paymentMethod: null, notes: "" }]);
    expect(ok[0]).toMatchObject({ company: "Bland Seguros", seller: null, quotaValue: "1500.00", notes: null });
    const dup = officialRowsSchema.safeParse([
      { order: 1, company: "A" },
      { order: 1, company: "B" },
    ]);
    expect(dup.success).toBe(false);
    expect(officialRowsSchema.safeParse([{ order: 1, company: "A", quotaValue: "cinco mil" }]).success).toBe(false);
  });
});
