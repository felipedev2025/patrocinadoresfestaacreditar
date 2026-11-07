import type { TemplateConfig, TemplateStyle } from "./types";

/** Formatos de telão criados automaticamente em cada evento. Dimensões sempre pares (exigência do H.264). */
export const FORMAT_PRESETS = [
  { name: "Horizontal Full HD", width: 1920, height: 1080, fps: 30, safeMarginPct: 5 },
  { name: "Horizontal 4K", width: 3840, height: 2160, fps: 30, safeMarginPct: 5 },
  { name: "Vertical", width: 1080, height: 1920, fps: 30, safeMarginPct: 6 },
  { name: "Quadrado", width: 1080, height: 1080, fps: 30, safeMarginPct: 6 },
  { name: "Ultrawide", width: 3840, height: 1080, fps: 30, safeMarginPct: 6 },
] as const;

/** Categorias padrão de um evento novo (editáveis). */
export const CATEGORY_PRESETS = [
  { name: "Patrocinador Master", sortOrder: 0, displaySeconds: 7, logoScale: 1.2, appearances: 2, animation: "spotlight", highlight: true, color: "#E09B12" },
  { name: "Patrocinador Ouro", sortOrder: 10, displaySeconds: 5, logoScale: 1.05, appearances: 1, animation: "zoom", highlight: false, color: "#D4AF37" },
  { name: "Patrocinador Prata", sortOrder: 20, displaySeconds: 4, logoScale: 0.95, appearances: 1, animation: "zoom", highlight: false, color: "#C0C0C0" },
  { name: "Patrocinador Bronze", sortOrder: 30, displaySeconds: 3.5, logoScale: 0.9, appearances: 1, animation: "fade", highlight: false, color: "#CD7F32" },
  { name: "Apoiador", sortOrder: 40, displaySeconds: 3, logoScale: 0.85, appearances: 1, animation: "fade", highlight: false, color: "#7FA7D9" },
  { name: "Parceiro Institucional", sortOrder: 50, displaySeconds: 3, logoScale: 0.85, appearances: 1, animation: "fade", highlight: false, color: "#9AD1B9" },
  { name: "Realização", sortOrder: 60, displaySeconds: 4, logoScale: 1, appearances: 1, animation: "fade", highlight: false, color: "#FFFFFF" },
] as const;

/** Biblioteca inicial de templates de sistema. */
export const TEMPLATE_PRESETS: { key: string; name: string; style: TemplateStyle; description: string; config: Partial<TemplateConfig> }[] = [
  {
    key: "elegante",
    name: "Elegante",
    style: "ELEGANTE",
    description: "Fundo escuro, iluminação dourada, movimentos suaves e logotipo em destaque.",
    config: { layout: "byCategory", particles: true, logoPlate: true },
  },
  {
    key: "festival",
    name: "Festival",
    style: "FESTIVAL",
    description: "Animações dinâmicas, feixes de luz, partículas e as cores do evento.",
    config: { layout: "sequential", transitionFrames: 8, particles: true, logoPlate: true },
  },
  {
    key: "institucional",
    name: "Institucional",
    style: "INSTITUCIONAL",
    description: "Visual limpo e sofisticado, ideal para eventos beneficentes.",
    config: { layout: "byCategory", logoPlate: false, titleWeight: 700, transitionFrames: 15 },
  },
  {
    key: "painel",
    name: "Painel de patrocinadores",
    style: "GRADE",
    description: "Logotipos organizados em grade com espaçamento uniforme, por categoria.",
    config: { layout: "grid", gridPageSize: 12, gridPageSeconds: 7, showSponsorNames: false },
  },
  {
    key: "master",
    name: "Patrocinador Master",
    style: "MASTER",
    description: "Exibição individual com destaque especial e animação premium.",
    config: { layout: "sequential", logoBox: 0.7, particles: true },
  },
];
