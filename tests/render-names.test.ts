import { describe, expect, it } from "vitest";
import { buildReelProps, contentHash } from "@/lib/render-input";

const event = {
  name: "Porto Feliz Fest Show", edition: "9ª edição", year: 2026, primaryColor: "#1E120A", secondaryColor: "#5A3620", accentColor: "#F29A1F",
  textColor: "#FFF4E0", headline: "H", thankYouMessage: "T", fontFamily: "Inter", logoAsset: null,
} as never;
const template = { style: "ELEGANTE", config: { showSponsorNames: true } } as never;
const format = { width: 1920, height: 1080, fps: 30, safeMarginPct: 5 } as never;
const approved = [
  { id: "s1", displayName: "Segatex", logoScale: 1, eventOrder: null, categoryId: null, category: null, logoAsset: { id: "a1", processedKey: "k1" } },
] as never;
const spec = { kind: "COLLECTIVE" as const, templateId: "t", formatId: "f" };

describe("nome do patrocinador embaixo do logo", () => {
  it("opção desmarcada esconde o nome; marcada mostra", () => {
    expect(buildReelProps(spec, event, template, format, approved, { showSponsorNames: false }).config.showSponsorNames).toBe(false);
    expect(buildReelProps(spec, event, template, format, approved, { showSponsorNames: true }).config.showSponsorNames).toBe(true);
  });
  it("vídeos antigos (sem a opção salva) seguem o template e mantêm o mesmo hash", () => {
    const oldSettings: { crf: number; videoBitrate: null; showSponsorNames?: boolean } = { crf: 18, videoBitrate: null };
    const before = buildReelProps(spec, event, template, format, approved);
    const after = buildReelProps(spec, event, template, format, approved, oldSettings);
    expect(after.config.showSponsorNames).toBe(true);
    expect(contentHash(after, oldSettings)).toBe(contentHash(before, oldSettings));
  });
});
