import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectImageType, processLogo, removeUniformBackground, sanitizeSvg } from "@/lib/images";

const MAX = 10 * 1024 * 1024;

async function pngLogo(bg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${bg}"/><circle cx="200" cy="100" r="60" fill="#c0392b"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("detecção de tipo por conteúdo", () => {
  it("identifica PNG, JPEG, WebP e SVG pelos magic bytes", async () => {
    const png = await pngLogo("#ffffff");
    expect(detectImageType(png)).toBe("png");
    expect(detectImageType(await sharp(png).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageType(await sharp(png).webp().toBuffer())).toBe("webp");
    expect(detectImageType(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
  });
  it("rejeita arquivos disfarçados (extensão não importa)", () => {
    expect(detectImageType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImageType(Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00"))).toBeNull();
  });
});

describe("sanitização de SVG", () => {
  it("remove scripts, handlers e referências externas", async () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
      <script>alert(2)</script>
      <foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject>
      <image xlink:href="http://evil.example/x.png" width="10" height="10"/>
      <a href="javascript:alert(4)"><rect width="10" height="10" fill="red"/></a>
      <rect width="50" height="50" fill="blue"/></svg>`;
    const clean = await sanitizeSvg(dirty);
    expect(clean).not.toMatch(/script|onload|foreignObject|iframe|evil\.example|javascript:/i);
    expect(clean).toContain("<rect");
  });
  it("bloqueia DOCTYPE/ENTITY (XXE, billion laughs)", async () => {
    await expect(sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>')).rejects.toThrow();
  });
});

describe("processamento de logotipo", () => {
  it("normaliza para PNG, recorta bordas e remove fundo sólido", async () => {
    const out = await processLogo(await pngLogo("#ffffff"), { removeBackground: true, maxBytes: MAX });
    expect(out.backgroundRemoved).toBe(true);
    expect(detectImageType(out.processed)).toBe("png");
    // recorte automático: sobra apenas o círculo (~120px)
    expect(out.width).toBeLessThan(160);
    const { data } = await sharp(out.processed).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // canto transparente
  });
  it("não remove fundo quando os cantos têm cores diferentes", () => {
    const w = 4, h = 4;
    const buf = Buffer.alloc(w * h * 4, 255);
    buf[0] = 0; // canto superior esquerdo diferente
    buf[(w - 1) * 4 + 1] = 0;
    expect(removeUniformBackground(buf, w, h)).toBeNull();
  });
  it("rejeita arquivos acima do limite e imagens minúsculas", async () => {
    await expect(processLogo(Buffer.alloc(20, 1), { maxBytes: 10 })).rejects.toThrow(/maior/);
    const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(processLogo(tiny, { maxBytes: MAX })).rejects.toThrow(/pequeno/);
  });
});
