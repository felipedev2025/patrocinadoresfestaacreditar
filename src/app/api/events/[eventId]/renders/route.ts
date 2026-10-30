import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, handler } from "@/lib/http";
import { renderCreateSchema } from "@/lib/validation";
import { computeOutdated, createRender } from "@/lib/services/renders";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ eventId: string }> };

/** Lista renders com progresso, status e indicação de desatualização. */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  await eventAccess(user, eventId, "render.view");
  const renders = await prisma.videoRender.findMany({
    where: { eventId },
    orderBy: { queuedAt: "desc" },
    take: 200,
  });
  const [outdated, templates, formats, sponsors, categories] = await Promise.all([
    computeOutdated(eventId, renders),
    prisma.videoTemplate.findMany({ select: { id: true, name: true } }),
    prisma.displayFormat.findMany({ where: { eventId }, select: { id: true, name: true, width: true, height: true } }),
    prisma.sponsorship.findMany({ where: { eventId }, select: { id: true, displayName: true } }),
    prisma.sponsorCategory.findMany({ where: { eventId }, select: { id: true, name: true } }),
  ]);
  const tName = new Map(templates.map((t) => [t.id, t.name]));
  const fMap = new Map(formats.map((f) => [f.id, f]));
  const sName = new Map(sponsors.map((s) => [s.id, s.displayName]));
  const cName = new Map(categories.map((c) => [c.id, c.name]));
  const st = storage();
  const list = await Promise.all(
    renders.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      progress: r.progress,
      version: r.version,
      error: r.error,
      published: r.published,
      publishOrder: r.publishOrder,
      durationSec: r.durationSec,
      sizeBytes: r.sizeBytes,
      queuedAt: r.queuedAt,
      finishedAt: r.finishedAt,
      outdated: outdated.has(r.id),
      template: tName.get(r.templateId) ?? "—",
      format: fMap.get(r.formatId) ?? null,
      target: r.sponsorshipId ? sName.get(r.sponsorshipId) ?? "(removido)" : r.categoryId ? cName.get(r.categoryId) ?? "(removida)" : null,
      sponsorCount: (r.inputProps as { sponsors?: unknown[] }).sponsors?.length ?? 0,
      thumbUrl: r.thumbKey ? await st.signedUrl(r.thumbKey, { ttlSec: 3600 }) : null,
      videoUrl: r.outputKey ? await st.signedUrl(r.outputKey, { ttlSec: 3600 }) : null,
    })),
  );
  return NextResponse.json({ renders: list });
});

/** Solicita a geração de vídeo(s). O trabalho pesado acontece no worker, nunca na requisição HTTP. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "render.create");
  const body = renderCreateSchema.parse(await req.json());
  const settings = { crf: body.videoBitrate ? null : (body.crf ?? 18), videoBitrate: body.videoBitrate ?? null };

  const created: string[] = [];
  if (body.kind === "INDIVIDUAL" && body.allIndividuals) {
    const approved = await prisma.sponsorship.findMany({
      where: { eventId, status: "APPROVED", logoAssetId: { not: null }, OR: [{ categoryId: null }, { category: { includeIndividual: true } }] },
      select: { id: true },
    });
    if (approved.length === 0) throw badRequest("Nenhum patrocinador aprovado com logotipo");
    for (const s of approved) {
      const r = await createRender({ eventId, organizationId: access.event.organizationId, userId: user.id, settings, spec: { ...body, sponsorshipId: s.id } });
      created.push(r.id);
    }
  } else {
    const r = await createRender({ eventId, organizationId: access.event.organizationId, userId: user.id, settings, spec: body });
    created.push(r.id);
  }
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "render.create", entity: "VideoRender", data: { kind: body.kind, count: created.length }, ip: clientIp(req) });
  return NextResponse.json({ renderIds: created }, { status: 201 });
});
