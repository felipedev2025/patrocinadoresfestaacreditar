// Teste de fumaça: renderiza um MP4 real sem banco/Redis, usando logotipos locais.
// Uso: npx tsx scripts/smoke-render.ts <dir-com-pngs> <saida.mp4> [layout] [style] [WxH]
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { renderReel, postProcess } from "../worker/render-reel";
import { normalizeConfig, type ReelProps } from "../src/remotion/types";

async function main() {
  const [dir, out, layout = "byCategory", style = "ELEGANTE", size = "1920x1080"] = process.argv.slice(2);
  if (!dir || !out) throw new Error("uso: smoke-render <dir> <out.mp4>");
  const [w, h] = size.split("x").map(Number);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".png"));
  const props: ReelProps = {
    mode: "collective",
    style: style as ReelProps["style"],
    config: normalizeConfig({ layout: layout as "grid", introSeconds: 2, outroSeconds: 2 }),
    event: {
      name: "Porto Fest", edition: "Teste", year: 2027, primary: "#0B0B12", secondary: "#24243a", accent: "#E09B12",
      text: "#FFFFFF", logo: null, headline: "AGRADECEMOS AO NOSSO PATROCINADOR", thankYou: "Obrigado por fazer parte desta história!", fontFamily: "Inter",
    },
    sponsors: files.map((f, i) => ({
      id: f, name: `Empresa ${i + 1}`, logo: path.join(dir, f), category: i === 0 ? "Master" : "Ouro", categoryColor: "#E09B12",
      categoryOrder: i === 0 ? 0 : 10, seconds: 2, scale: 1, highlight: i === 0, animation: "zoom", appearances: 1,
    })),
    format: { width: w!, height: h!, fps: 30, safeMarginPct: 5 },
  };
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "smoke-"));
  const raw = path.join(work, "raw.mp4");
  const t = Date.now();
  const { durationSec } = await renderReel({
    props, workDir: work, outFile: raw, settings: { crf: 20 },
    fetchAsset: (key, dest) => fs.copyFile(key, dest),
    onProgress: (p) => process.stdout.write(`\r${Math.round(p * 100)}%`),
  });
  await postProcess(raw, out, out.replace(/\.mp4$/, ".jpg"), durationSec);
  console.log(`\nOK ${durationSec}s em ${((Date.now() - t) / 1000).toFixed(1)}s -> ${out}`);
  await fs.rm(work, { recursive: true, force: true });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
