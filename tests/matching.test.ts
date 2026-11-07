import { describe, expect, it } from "vitest";
import { assignMatches, decideMatch, matchName, nameSimilarity, normalizeName, rankCandidates } from "@/lib/matching";

const cands = (...names: string[]) => names.map((n, i) => ({ item: { id: String(i), name: n }, names: [n] }));

describe("normalizeName", () => {
  it("remove acentos, extensão, separadores e palavras genéricas", () => {
    expect(normalizeName("blandy-seguros.png")).toBe("blandy seguros");
    expect(normalizeName("Padaria_Pão.Quente LTDA.jpg")).toBe("padaria pao quente");
    expect(normalizeName("Comercial Silva S/A")).toBe("comercial silva");
    expect(normalizeName("Comercial Silva S.A.")).toBe("comercial silva");
    expect(normalizeName("logo-final (1).webp")).toBe("");
    expect(normalizeName("R&C Eletritec ME")).toBe("r c eletritec");
    expect(normalizeName("  93 FM  ")).toBe("93 fm");
  });
});

describe("similaridade — casos reais da lista", () => {
  it('"Bland Seguros" × "blandy-seguros.png" vincula automaticamente', () => {
    const d = matchName("blandy-seguros.png", cands("Bland Seguros", "Segatex", "Porto Net"));
    expect(d.kind).toBe("link");
    if (d.kind === "link") expect(d.best.item.name).toBe("Bland Seguros");
    expect(nameSimilarity(normalizeName("Bland Seguros"), normalizeName("blandy-seguros.png"))).toBeGreaterThanOrEqual(0.85);
  });

  it('"Port Net" × "Porto Net" vincula automaticamente', () => {
    const d = matchName("Port Net", cands("Porto Net", "Bland Seguros"));
    expect(d.kind).toBe("link");
    if (d.kind === "link") expect(d.best.item.name).toBe("Porto Net");
  });

  it('"Segato Madeiras" × "Segatex" nunca vincula sozinho (fica como sugestão)', () => {
    const s = nameSimilarity(normalizeName("Segato Madeiras"), normalizeName("Segatex"));
    expect(s).toBeGreaterThanOrEqual(0.6);
    expect(s).toBeLessThan(0.85);
    expect(matchName("Segatex", cands("Segato Madeiras")).kind).toBe("suggest");
  });

  it('com os dois na lista: "segatex.png" vai para Segatex; "segato.png" fica como sugestão', () => {
    const list = cands("Segato Madeiras", "Segatex");
    const a = matchName("segatex.png", list);
    expect(a.kind).toBe("link");
    if (a.kind === "link") expect(a.best.item.name).toBe("Segatex");
    const b = matchName("segato.png", list);
    expect(b.kind).toBe("suggest");
    if (b.kind === "suggest") expect(b.best.item.name).toBe("Segato Madeiras");
  });

  it('"R & C" × "R&C Eletritec" é sugerido (abreviação pede confirmação)', () => {
    const d = matchName("R & C", cands("R&C Eletritec", "Bland Seguros"));
    expect(d.kind).toBe("suggest");
    if (d.kind === "suggest") expect(d.best.item.name).toBe("R&C Eletritec");
    // "R&C" e "R C" são o mesmo nome
    expect(nameSimilarity(normalizeName("R&C"), normalizeName("R C"))).toBeGreaterThanOrEqual(0.95);
  });

  it("nomes sem relação ficam em 'não identificado'", () => {
    expect(matchName("IMG_2034.jpg", cands("Bland Seguros", "Segatex")).kind).toBe("none");
    expect(matchName("Febec", cands("Giuli")).kind).toBe("none");
  });
});

describe("regra de decisão", () => {
  const r = (scores: number[]) => scores.map((score, i) => ({ item: { id: String(i) }, score, matchedName: "" }));
  it("≥ 0,85 com folga de 0,10 → vincula", () => expect(decideMatch(r([0.9, 0.7])).kind).toBe("link"));
  it("≥ 0,85 com empate próximo → sugere", () => {
    const d = decideMatch(r([0.9, 0.85]));
    expect(d.kind).toBe("suggest");
    if (d.kind === "suggest") expect(d.reason).toBe("close-tie");
  });
  it("entre 0,60 e 0,85 → sugere", () => expect(decideMatch(r([0.7])).kind).toBe("suggest"));
  it("< 0,60 → nenhum", () => expect(decideMatch(r([0.59])).kind).toBe("none"));
});

describe("apelidos e atribuição sem repetição", () => {
  it("usa os apelidos aprendidos como nomes alternativos", () => {
    const list = [{ item: { id: "x" }, names: ["Blandy Corretora de Seguros", "Bland Seguros"] }];
    const ranking = rankCandidates("bland-seguros.png", list);
    expect(ranking[0]!.score).toBe(1);
    expect(ranking[0]!.matchedName).toBe("Bland Seguros");
  });

  it("não liga dois slots ao mesmo patrocinador (o de maior score fica com ele)", () => {
    const out = assignMatches(
      [
        { key: "s1", name: "Porto Net" },
        { key: "s2", name: "Port Net Telecom" },
      ],
      [{ item: { id: "p1" }, names: ["Porto Net"] }],
    );
    expect(out.get("s1")!.kind).toBe("link");
    expect(out.get("s2")!.kind).toBe("none");
  });
});
