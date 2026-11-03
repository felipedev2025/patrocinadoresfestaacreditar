import type { DisplayFormat, Event, Prisma, RenderKind, SponsorCategory, VideoTemplate } from "@prisma/client";
import { prisma } from "./db";
import { sha256 } from "./crypto";
import { normalizeConfig, type ReelProps, type ReelSponsor, type SponsorAnimation, type TemplateConfig } from "@/remotion/types";

export type RenderSpec = {
  kind: RenderKind;
  templateId: string;
  formatId: string;
  sponsorshipId?: string | null;
  categoryId?: string | null;
  selectedIds?: string[] | null;
};

type EventWithLogo = Event & { logoAsset: { processedKey: string } | null };
type ApprovedSponsorship = Prisma.SponsorshipGetPayload<{
  include: { category: true; logoAsset: { select: { id: true; processedKey: true } } };
}>;

/** Carrega tudo que influencia o conteúdo dos vídeos de um evento (uma consulta por tabela). */
export async function loadRenderContext(eventId: string) {
  const [event, sponsorships] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { logoAsset: { select: { processedKey: true } } } }),
    prisma.sponsorship.findMany({
      where: { eventId, status: "APPROVED", logoAssetId: { not: null } },
      include: { category: true, logoAsset: { select: { id: true, processedKey: true } } },
      // Sem ordem manual (todos null) a sequência é a mesma de antes: não invalida vídeos já gerados
      orderBy: [{ eventOrder: { sort: "asc", nulls: "last" } }, { category: { sortOrder: "asc" } }, { displayName: "asc" }],
    }),
  ]);
  return { event, sponsorships };
}

function toReelSponsor(s: ApprovedSponsorship, individual: boolean): ReelSponsor {
  const c: SponsorCategory | null = s.category;
  return {
    id: s.id,
    name: s.displayName,
    logo: s.logoAsset!.processedKey,
    category: c?.name ?? null,
    categoryColor: c?.color ?? "#E09B12",
    categoryOrder: c?.sortOrder ?? 999,
    seconds: individual ? Math.max(4, c?.displaySeconds ?? 4) : (c?.displaySeconds ?? 4),
    scale: (c?.logoScale ?? 1) * s.logoScale,
    highlight: c?.highlight ?? false,
    animation: ((c?.animation ?? "fade") as SponsorAnimation),
    appearances: c?.appearances ?? 1,
    // Só entra no snapshot quando existe: patrocinadores sem ordem mantêm o mesmo hash de antes
    ...(s.eventOrder != null ? { eventOrder: s.eventOrder } : {}),
  };
}

/** Seleciona os patrocinadores que entram em um vídeo conforme o tipo. */
export function selectSponsors(spec: RenderSpec, all: ApprovedSponsorship[]): ApprovedSponsorship[] {
  switch (spec.kind) {
    case "INDIVIDUAL":
      return all.filter((s) => s.id === spec.sponsorshipId && (s.category?.includeIndividual ?? true));
    case "CATEGORY":
      return all.filter((s) => s.categoryId === spec.categoryId);
    case "COLLECTIVE":
      if (spec.selectedIds && spec.selectedIds.length > 0) {
        const set = new Set(spec.selectedIds);
        return all.filter((s) => set.has(s.id));
      }
      return all.filter((s) => s.category?.includeInCollective ?? true);
  }
}

export function buildReelProps(
  spec: RenderSpec,
  event: EventWithLogo,
  template: VideoTemplate,
  format: DisplayFormat,
  approved: ApprovedSponsorship[],
): ReelProps {
  const chosen = selectSponsors(spec, approved);
  const individual = spec.kind === "INDIVIDUAL";
  const config: TemplateConfig = normalizeConfig(template.config as Partial<TemplateConfig>);
  return {
    mode: individual ? "individual" : "collective",
    style: template.style,
    config: spec.kind === "CATEGORY" ? { ...config, layout: config.layout === "grid" ? "grid" : "sequential" } : config,
    event: {
      name: event.name,
      edition: event.edition,
      year: event.year,
      primary: event.primaryColor,
      secondary: event.secondaryColor,
      accent: event.accentColor,
      text: event.textColor,
      logo: event.logoAsset?.processedKey ?? null,
      headline: event.headline,
      thankYou: event.thankYouMessage,
      fontFamily: event.fontFamily,
    },
    sponsors: chosen.map((s) => toReelSponsor(s, individual)),
    format: { width: format.width, height: format.height, fps: format.fps, safeMarginPct: format.safeMarginPct },
  };
}

/** Serialização estável (chaves ordenadas) para que o hash não dependa da ordem dos campos. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Hash do conteúdo do vídeo. Se o hash atual diferir do hash gravado no render,
 * o vídeo está desatualizado (novo patrocinador, troca de logo, cores, template…).
 */
export function contentHash(props: ReelProps, settings: unknown): string {
  return sha256(stableStringify({ props, settings }));
}
