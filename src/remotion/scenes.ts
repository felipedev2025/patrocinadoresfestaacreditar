import type { ReelProps, ReelSponsor } from "./types";

export type Scene =
  | { type: "intro"; frames: number }
  | { type: "category"; frames: number; title: string; color: string }
  | { type: "sponsor"; frames: number; sponsor: ReelSponsor }
  | { type: "grid"; frames: number; title: string | null; sponsors: ReelSponsor[] }
  | { type: "individual"; frames: number; sponsor: ReelSponsor }
  | { type: "outro"; frames: number };

const sec = (s: number, fps: number) => Math.max(1, Math.round(s * fps));

/** Agrupa por categoria respeitando a ordem configurada (menor sortOrder primeiro). */
export function groupByCategory(sponsors: ReelSponsor[]) {
  const groups = new Map<string, { title: string; color: string; order: number; items: ReelSponsor[] }>();
  for (const s of sponsors) {
    const key = s.category ?? "—";
    if (!groups.has(key)) groups.set(key, { title: s.category ?? "Patrocinadores", color: s.categoryColor, order: s.categoryOrder, items: [] });
    groups.get(key)!.items.push(s);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

/**
 * Converte as props em uma linha do tempo determinística. Usada tanto para calcular
 * a duração do vídeo (calculateMetadata) quanto para montar a composição.
 */
export function buildScenes(props: ReelProps): Scene[] {
  const { fps } = props.format;
  const cfg = props.config;
  const scenes: Scene[] = [];

  if (props.mode === "individual") {
    const s = props.sponsors[0];
    if (!s) return [{ type: "intro", frames: sec(3, fps) }];
    scenes.push({ type: "individual", frames: sec(Math.max(6, s.seconds + 4), fps), sponsor: s });
    return scenes;
  }

  if (cfg.introSeconds > 0) scenes.push({ type: "intro", frames: sec(cfg.introSeconds, fps) });

  const ordered = [...props.sponsors].sort((a, b) => a.categoryOrder - b.categoryOrder);
  const groups = groupByCategory(ordered);

  for (const g of groups) {
    // Categorias de destaque (Master) sempre aparecem individualmente, mesmo no layout em grade.
    const individual = cfg.layout !== "grid" || g.items.every((i) => i.highlight);
    if (cfg.showCategoryTitles && cfg.layout === "byCategory") {
      scenes.push({ type: "category", frames: sec(1.6, fps), title: g.title, color: g.color });
    }
    if (individual) {
      for (const s of g.items) scenes.push({ type: "sponsor", frames: sec(s.seconds, fps), sponsor: s });
    } else {
      for (let i = 0; i < g.items.length; i += cfg.gridPageSize) {
        scenes.push({
          type: "grid",
          frames: sec(cfg.gridPageSeconds, fps),
          title: cfg.showCategoryTitles ? g.title : null,
          sponsors: g.items.slice(i, i + cfg.gridPageSize),
        });
      }
    }
  }

  // Aparições adicionais (ex.: Master aparece 2x por ciclo) ao final da sequência.
  const maxAppear = Math.max(1, ...ordered.map((s) => s.appearances));
  for (let round = 2; round <= maxAppear; round++) {
    for (const s of ordered.filter((x) => x.appearances >= round)) {
      scenes.push({ type: "sponsor", frames: sec(s.seconds, fps), sponsor: s });
    }
  }

  if (cfg.outroSeconds > 0) scenes.push({ type: "outro", frames: sec(cfg.outroSeconds, fps) });
  if (scenes.length === 0) scenes.push({ type: "intro", frames: sec(3, fps) });
  return scenes;
}

export function totalFrames(scenes: Scene[]) {
  return scenes.reduce((s, x) => s + x.frames, 0);
}

/** Melhor grade (colunas × linhas) para N logotipos em uma área W×H, maximizando a célula. */
export function bestGrid(n: number, w: number, h: number, cellAspect = 1.6) {
  let best = { cols: 1, rows: n, cell: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const cell = Math.min(cellW, cellH * cellAspect);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
}
