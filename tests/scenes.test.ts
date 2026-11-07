import { describe, expect, it } from "vitest";
import { bestGrid, buildScenes, totalFrames } from "@/remotion/scenes";
import { normalizeConfig, type ReelProps, type ReelSponsor } from "@/remotion/types";

const sponsor = (id: string, cat: string, order: number, extra: Partial<ReelSponsor> = {}): ReelSponsor => ({
  id, name: id, logo: `${id}.png`, category: cat, categoryColor: "#fff", categoryOrder: order,
  seconds: 4, scale: 1, highlight: false, animation: "fade", appearances: 1, ...extra,
});

const base = (sponsors: ReelSponsor[], layout: "sequential" | "byCategory" | "grid" = "byCategory"): ReelProps => ({
  mode: "collective",
  style: "ELEGANTE",
  config: normalizeConfig({ layout, introSeconds: 3, outroSeconds: 4 }),
  event: { name: "E", edition: null, year: 2026, primary: "#000000", secondary: "#111111", accent: "#ffaa00", text: "#ffffff", logo: null, headline: "H", thankYou: "T", fontFamily: "Inter" },
  sponsors,
  format: { width: 1920, height: 1080, fps: 30, safeMarginPct: 5 },
});

describe("linha do tempo do vídeo", () => {
  it("ordena por categoria e adiciona títulos de categoria", () => {
    const scenes = buildScenes(base([sponsor("b", "Ouro", 10), sponsor("a", "Master", 0)]));
    expect(scenes.map((s) => s.type)).toEqual(["intro", "category", "sponsor", "category", "sponsor", "outro"]);
    expect(scenes[1]).toMatchObject({ title: "Master" });
  });
  it("respeita tempo de exposição e aparições extras", () => {
    const scenes = buildScenes(base([sponsor("m", "Master", 0, { seconds: 7, appearances: 2 }), sponsor("x", "Ouro", 10)], "sequential"));
    const masters = scenes.filter((s) => s.type === "sponsor" && s.sponsor.id === "m");
    expect(masters).toHaveLength(2);
    expect(masters[0]!.frames).toBe(210);
    expect(totalFrames(scenes)).toBe(90 + 210 + 120 + 210 + 120);
  });
  it("pagina a grade, mantendo destaques individuais", () => {
    const many = Array.from({ length: 30 }, (_, i) => sponsor(`s${i}`, "Apoio", 40));
    const scenes = buildScenes(base([sponsor("m", "Master", 0, { highlight: true }), ...many], "grid"));
    expect(scenes.filter((s) => s.type === "grid")).toHaveLength(3);
    expect(scenes.some((s) => s.type === "sponsor" && s.sponsor.id === "m")).toBe(true);
  });
  it("vídeo individual tem uma cena", () => {
    const p = { ...base([sponsor("a", "Ouro", 1)]), mode: "individual" as const };
    expect(buildScenes(p).map((s) => s.type)).toEqual(["individual"]);
  });
  it("grade escolhe mais colunas em telas largas", () => {
    expect(bestGrid(8, 3600, 900).cols).toBeGreaterThan(bestGrid(8, 900, 1700).cols);
  });
});
