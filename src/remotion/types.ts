// Tipos compartilhados entre app web (prévia), API (snapshot) e worker (renderização).
// Este diretório NÃO pode importar nada do Next.js / Prisma: é empacotado pelo Remotion.

export type TemplateStyle = "ELEGANTE" | "FESTIVAL" | "INSTITUCIONAL" | "GRADE" | "MASTER";
export type ReelLayout = "sequential" | "byCategory" | "grid";
export type SponsorAnimation = "fade" | "zoom" | "slide" | "spotlight";

export type TemplateConfig = {
  layout: ReelLayout;
  introSeconds: number;
  outroSeconds: number;
  transitionFrames: number;
  headline: string | null; // null = usa o texto do evento
  closing: string | null; // null = usa a mensagem de agradecimento do evento
  showSponsorNames: boolean;
  showCategoryTitles: boolean;
  gridPageSize: number;
  gridPageSeconds: number;
  fontFamily: string | null;
  titleWeight: number;
  logoBox: number; // fração da área segura ocupada pelo logotipo (0.3 – 0.9)
  logoPlate: boolean; // placa clara atrás do logotipo para garantir contraste
  particles: boolean;
  backgroundColor: string | null; // sobrescreve a cor primária do evento
  accentColor: string | null; // sobrescreve a cor de destaque do evento
};

export type ReelSponsor = {
  id: string;
  name: string;
  logo: string; // chave do storage no snapshot; URL na prévia e na renderização
  category: string | null;
  categoryColor: string;
  categoryOrder: number;
  seconds: number;
  scale: number;
  highlight: boolean;
  animation: SponsorAnimation;
  appearances: number;
};

export type ReelEvent = {
  name: string;
  edition: string | null;
  year: number;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  logo: string | null;
  headline: string;
  thankYou: string;
  fontFamily: string;
};

export type ReelFormat = { width: number; height: number; fps: number; safeMarginPct: number };

export type ReelProps = {
  mode: "collective" | "individual";
  style: TemplateStyle;
  config: TemplateConfig;
  event: ReelEvent;
  sponsors: ReelSponsor[];
  format: ReelFormat;
};

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  layout: "byCategory",
  introSeconds: 3,
  outroSeconds: 4,
  transitionFrames: 12,
  headline: null,
  closing: null,
  showSponsorNames: true,
  showCategoryTitles: true,
  gridPageSize: 12,
  gridPageSeconds: 6,
  fontFamily: null,
  titleWeight: 800,
  logoBox: 0.62,
  logoPlate: true,
  particles: false,
  backgroundColor: null,
  accentColor: null,
};

/** Mescla configuração parcial (vinda do banco) com os padrões, limitando faixas perigosas. */
export function normalizeConfig(partial: Partial<TemplateConfig> | null | undefined): TemplateConfig {
  const c = { ...DEFAULT_TEMPLATE_CONFIG, ...(partial ?? {}) };
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return {
    ...c,
    introSeconds: clamp(c.introSeconds, 0, 15),
    outroSeconds: clamp(c.outroSeconds, 0, 15),
    transitionFrames: Math.round(clamp(c.transitionFrames, 0, 30)),
    gridPageSize: Math.round(clamp(c.gridPageSize, 2, 40)),
    gridPageSeconds: clamp(c.gridPageSeconds, 2, 30),
    titleWeight: Math.round(clamp(c.titleWeight, 300, 900)),
    logoBox: clamp(c.logoBox, 0.3, 0.9),
  };
}
