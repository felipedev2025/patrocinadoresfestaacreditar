import type { Prisma, VideoRender } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, notFound } from "../http";
import { enqueueRender } from "../queue";
import { buildReelProps, contentHash, loadRenderContext, type RenderSpec } from "../render-input";

export type RenderSettings = { crf: number | null; videoBitrate: string | null };

/** Cria o registro do render com snapshot completo e enfileira para o worker. */
export async function createRender(opts: {
  eventId: string;
  organizationId: string;
  userId: string;
  spec: RenderSpec;
  settings: RenderSettings;
  replacesRenderId?: string | null;
}): Promise<VideoRender> {
  const [ctx, template, format] = await Promise.all([
    loadRenderContext(opts.eventId),
    prisma.videoTemplate.findFirst({
      where: { id: opts.spec.templateId, OR: [{ organizationId: null }, { organizationId: opts.organizationId }] },
    }),
    prisma.displayFormat.findFirst({ where: { id: opts.spec.formatId, eventId: opts.eventId } }),
  ]);
  if (!template) throw notFound("Template não encontrado");
  if (!format) throw notFound("Formato de telão não encontrado");
  if (opts.spec.kind === "INDIVIDUAL" && !opts.spec.sponsorshipId) throw badRequest("Selecione o patrocinador");
  if (opts.spec.kind === "CATEGORY" && !opts.spec.categoryId) throw badRequest("Selecione a categoria");

  const props = buildReelProps(opts.spec, ctx.event, template, format, ctx.sponsorships);
  if (props.sponsors.length === 0) {
    throw badRequest("Nenhum patrocinador aprovado (com logotipo) atende a este vídeo");
  }
  const last = await prisma.videoRender.findFirst({
    where: {
      eventId: opts.eventId,
      kind: opts.spec.kind,
      templateId: template.id,
      formatId: format.id,
      sponsorshipId: opts.spec.sponsorshipId ?? null,
      categoryId: opts.spec.categoryId ?? null,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const render = await prisma.videoRender.create({
    data: {
      eventId: opts.eventId,
      templateId: template.id,
      formatId: format.id,
      kind: opts.spec.kind,
      sponsorshipId: opts.spec.sponsorshipId ?? null,
      categoryId: opts.spec.categoryId ?? null,
      selectedIds: opts.spec.selectedIds?.length ? opts.spec.selectedIds : undefined,
      version: (last?.version ?? 0) + 1,
      inputProps: props as unknown as Prisma.InputJsonValue,
      contentHash: contentHash(props, opts.settings),
      settings: opts.settings,
      createdById: opts.userId,
      replacesRenderId: opts.replacesRenderId ?? null,
    },
  });
  await enqueueRender(render.id);
  return render;
}

/** Recalcula hashes atuais e indica quais renders concluídos estão desatualizados. */
export async function computeOutdated(eventId: string, renders: VideoRender[]) {
  if (renders.length === 0) return new Set<string>();
  const ctx = await loadRenderContext(eventId);
  const templateIds = [...new Set(renders.map((r) => r.templateId))];
  const formatIds = [...new Set(renders.map((r) => r.formatId))];
  const [templates, formats] = await Promise.all([
    prisma.videoTemplate.findMany({ where: { id: { in: templateIds } } }),
    prisma.displayFormat.findMany({ where: { id: { in: formatIds } } }),
  ]);
  const tMap = new Map(templates.map((t) => [t.id, t]));
  const fMap = new Map(formats.map((f) => [f.id, f]));
  const outdated = new Set<string>();
  for (const r of renders) {
    if (r.status !== "COMPLETED") continue;
    const t = tMap.get(r.templateId);
    const f = fMap.get(r.formatId);
    if (!t || !f) continue;
    const spec: RenderSpec = {
      kind: r.kind,
      templateId: r.templateId,
      formatId: r.formatId,
      sponsorshipId: r.sponsorshipId,
      categoryId: r.categoryId,
      selectedIds: (r.selectedIds as string[] | null) ?? null,
    };
    const props = buildReelProps(spec, ctx.event, t, f, ctx.sponsorships);
    if (contentHash(props, r.settings) !== r.contentHash) outdated.add(r.id);
  }
  return outdated;
}

export function specOf(r: VideoRender): RenderSpec {
  return {
    kind: r.kind,
    templateId: r.templateId,
    formatId: r.formatId,
    sponsorshipId: r.sponsorshipId,
    categoryId: r.categoryId,
    selectedIds: (r.selectedIds as string[] | null) ?? null,
  };
}
