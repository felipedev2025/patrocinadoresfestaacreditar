import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { COMPOSITION_ID } from "../src/remotion/Root";
import type { ReelProps } from "../src/remotion/types";
import { serveDirectory } from "./assets-server";

export type RenderSettings = { crf?: number | null; videoBitrate?: string | null };

let bundlePromise: Promise<string> | null = null;

/** O bundle (webpack) das composições é gerado uma única vez por processo do worker. */
export function getBundle() {
  if (!bundlePromise) {
    const entryPoint = path.resolve(__dirname, "../src/remotion/index.ts");
    console.log("[worker] gerando bundle Remotion…");
    bundlePromise = bundle({ entryPoint, webpackOverride: (c) => c }).catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }
  return bundlePromise;
}

/**
 * Renderiza o reel em MP4 H.264. `fetchAsset` baixa cada chave do storage para o disco local;
 * as imagens são servidas ao Chrome por um servidor HTTP efêmero.
 */
export async function renderReel(opts: {
  props: ReelProps;
  workDir: string;
  outFile: string;
  settings: RenderSettings;
  fetchAsset: (key: string, dest: string) => Promise<void>;
  onProgress?: (p: number) => void;
  cancelSignal?: () => boolean;
}) {
  const assetsDir = path.join(opts.workDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  // Baixa cada chave distinta uma única vez
  const keys = new Set<string>();
  opts.props.sponsors.forEach((s) => keys.add(s.logo));
  if (opts.props.event.logo) keys.add(opts.props.event.logo);
  const local = new Map<string, string>();
  let i = 0;
  for (const key of keys) {
    const file = `a${i++}.png`;
    await opts.fetchAsset(key, path.join(assetsDir, file));
    local.set(key, file);
  }

  const server = await serveDirectory(assetsDir);
  try {
    const inputProps: ReelProps = {
      ...opts.props,
      event: { ...opts.props.event, logo: opts.props.event.logo ? server.url(local.get(opts.props.event.logo)!) : null },
      sponsors: opts.props.sponsors.map((s) => ({ ...s, logo: server.url(local.get(s.logo)!) })),
    };
    const serveUrl = await getBundle();
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
    const chromiumOptions = { gl: "swangle" as const };
    const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps, browserExecutable, chromiumOptions });
    const frameConc = process.env.RENDER_FRAME_CONCURRENCY ? Number(process.env.RENDER_FRAME_CONCURRENCY) : null;
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      outputLocation: opts.outFile,
      browserExecutable,
      chromiumOptions,
      muted: true, // telões normalmente reproduzem sem áudio
      pixelFormat: "yuv420p", // máxima compatibilidade com players de LED / TVs
      crf: opts.settings.videoBitrate ? undefined : (opts.settings.crf ?? 18),
      videoBitrate: opts.settings.videoBitrate ?? undefined,
      concurrency: frameConc,
      timeoutInMilliseconds: 60_000,
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
    return { durationSec: composition.durationInFrames / composition.fps };
  } finally {
    await server.close();
  }
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}: ${err}`))));
  });
}

/**
 * Pós-processamento com FFmpeg: move o índice (moov) para o início do arquivo
 * (reprodução progressiva/streaming no telão) e gera a miniatura JPG.
 */
export async function postProcess(input: string, output: string, thumb: string, durationSec: number) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  await run(ffmpeg, ["-y", "-v", "error", "-i", input, "-c", "copy", "-movflags", "+faststart", output]);
  const at = Math.min(Math.max(durationSec * 0.3, 0), Math.max(durationSec - 0.1, 0)).toFixed(2);
  await run(ffmpeg, ["-y", "-v", "error", "-ss", at, "-i", output, "-frames:v", "1", "-vf", "scale='min(960,iw)':-2", "-q:v", "3", thumb]);
}
