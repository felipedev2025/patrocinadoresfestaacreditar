import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, forbidden, handler, notFound } from "@/lib/http";
import { createRender, specOf } from "@/lib/services/renders";
import { enqueueRender, renderQueue } from "@/lib/queue";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const actionSchema = z.object({
  action: z.enum(["publish", "unpublish", "regenerate", "retry", "cancel", "reorder"]),
  publishOrder: z.number().int().min(0).max(10000).optional(),
});

async function load(id: string) {
  const r = await prisma.videoRender.findUnique({ where: { id } });
  if (!r) throw notFound("Vídeo não encontrado");
  return r;
}

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const r = await load((await params).id);
  await eventAccess(user, r.eventId, "render.view");
  return NextResponse.json({ id: r.id, status: r.status, progress: r.progress, error: r.error });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const r = await load((await params).id);
  const access = await eventAccess(user, r.eventId, "render.view");
  const { action, publishOrder } = actionSchema.parse(await req.json());
  const screenAction = action === "publish" || action === "unpublish" || action === "reorder";
  if (screenAction ? !access.can("screen.operate") : !access.can("render.create")) throw forbidden();

  let result: unknown = null;
  switch (action) {
    case "publish": {
      if (r.status !== "COMPLETED") throw badRequest("Somente vídeos concluídos podem ir para o telão");
      const max = await prisma.videoRender.aggregate({ where: { eventId: r.eventId, published: true }, _max: { publishOrder: true } });
      result = await prisma.videoRender.update({ where: { id: r.id }, data: { published: true, publishOrder: publishOrder ?? (max._max.publishOrder ?? 0) + 1 } });
      break;
    }
    case "unpublish":
      result = await prisma.videoRender.update({ where: { id: r.id }, data: { published: false } });
      break;
    case "reorder":
      result = await prisma.videoRender.update({ where: { id: r.id }, data: { publishOrder: publishOrder ?? 0 } });
      break;
    case "regenerate": {
      // Nova versão com os dados atuais; se a anterior estiver no telão, é substituída ao concluir.
      const nr = await createRender({
        eventId: r.eventId,
        organizationId: access.event.organizationId,
        userId: user.id,
        spec: specOf(r),
        settings: r.settings as { crf: number | null; videoBitrate: string | null },
        replacesRenderId: r.id,
      });
      result = { renderId: nr.id };
      break;
    }
    case "retry": {
      if (r.status !== "FAILED" && r.status !== "CANCELED") throw badRequest("Apenas vídeos com falha podem ser reprocessados");
      await prisma.videoRender.update({ where: { id: r.id }, data: { status: "QUEUED", error: null, progress: 0, queuedAt: new Date() } });
      const job = await renderQueue().getJob(r.id);
      if (job) await job.remove().catch(() => {});
      await enqueueRender(r.id);
      result = { ok: true };
      break;
    }
    case "cancel": {
      if (r.status !== "QUEUED") throw badRequest("Só é possível cancelar vídeos que ainda estão na fila");
      const job = await renderQueue().getJob(r.id);
      if (job) await job.remove().catch(() => {});
      result = await prisma.videoRender.update({ where: { id: r.id }, data: { status: "CANCELED" } });
      break;
    }
  }
  await audit({ organizationId: access.event.organizationId, eventId: r.eventId, userId: user.id, action: `render.${action}`, entity: "VideoRender", entityId: r.id, ip: clientIp(req) });
  return NextResponse.json({ result });
});
