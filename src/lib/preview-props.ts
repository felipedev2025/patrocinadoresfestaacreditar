import type { Event, SponsorCategory } from "@prisma/client";
import { normalizeConfig, type ReelEvent, type ReelProps, type ReelSponsor, type SponsorAnimation } from "@/remotion/types";

/** Dados de identidade do evento serializáveis para a prévia no cliente. */
export function reelEventOf(event: Event, logoUrl: string | null): ReelEvent {
  return {
    name: event.name,
    edition: event.edition,
    year: event.year,
    primary: event.primaryColor,
    secondary: event.secondaryColor,
    accent: event.accentColor,
    text: event.textColor,
    logo: logoUrl,
    headline: event.headline,
    thankYou: event.thankYouMessage,
    fontFamily: event.fontFamily,
  };
}

export type PreviewCategory = Pick<SponsorCategory, "id" | "name" | "color" | "sortOrder" | "displaySeconds" | "logoScale" | "highlight" | "animation" | "appearances">;

export function individualPreviewProps(ev: ReelEvent, sponsor: { name: string; logo: string; scale: number }, cat: PreviewCategory | null): ReelProps {
  const s: ReelSponsor = {
    id: "preview",
    name: sponsor.name || "Nome do patrocinador",
    logo: sponsor.logo,
    category: cat?.name ?? null,
    categoryColor: cat?.color ?? ev.accent,
    categoryOrder: cat?.sortOrder ?? 0,
    seconds: Math.max(4, cat?.displaySeconds ?? 4),
    scale: (cat?.logoScale ?? 1) * sponsor.scale,
    highlight: cat?.highlight ?? false,
    animation: (cat?.animation ?? "zoom") as SponsorAnimation,
    appearances: 1,
  };
  return {
    mode: "individual",
    style: cat?.highlight ? "MASTER" : "ELEGANTE",
    config: normalizeConfig({ particles: true }),
    event: ev,
    sponsors: [s],
    format: { width: 1920, height: 1080, fps: 30, safeMarginPct: 5 },
  };
}
