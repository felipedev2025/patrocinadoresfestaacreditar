/**
 * Worker de renderização — processo independente do servidor web.
 * - Consome a fila BullMQ "video-render" com concorrência limitada (RENDER_CONCURRENCY).
 * - Atualiza progresso no banco (throttled), faz novas tentativas com backoff exponencial.
 * - Pós-processa com FFmpeg (faststart + miniatura) e envia o MP4 para o storage.
 * - Rotina de manutenção: remove logotipos órfãos e sessões expiradas.
 */
import "./load-env";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { Worker, Queue, type Job } from "bullmq";
import { prisma } from "../src/lib/db";
import { storage, keys } from "../src/lib/storage";
import { RENDER_QUEUE, MAINTENANCE_QUEUE, redisConnection, type RenderJobData } from "../src/lib/queue";
import type { ReelProps } from "../src/remotion/types";
import { getBundle, postProcess, renderReel, type RenderSettings } from "./render-reel";

const concurrency = Math.max(1, Number(process.env.RENDER_CONCURRENCY ?? 1));

async function processRender(job: Job<RenderJobData>) {
  const render = await prisma.videoRender.findUnique({ where: { id: job.data.renderId }, include: { event: { select: { organizationId: true } } } });
  if (!render) return { skipped: "render removido" };
  if (render.status === "CANCELED" || render.status === "COMPLETED") return { skipped: render.status };

  await prisma.videoRender.update({
    where: { id: render.id },
    data: { status: "RENDERING", startedAt: new Date(), progress: 0, error: null, attempts: { increment: 1 } },
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `render-${render.id}-`));
  const st = storage();
  let lastWrite = 0;
  try {
    const raw = path.join(workDir, "raw.mp4");
    const final = path.join(workDir, "video.mp4");
    const thumb = path.join(workDir, "thumb.jpg");
    const { durationSec } = await renderReel({
      props: render.inputProps as unknown as ReelProps,
      workDir,
      outFile: raw,
      settings: render.settings as RenderSettings,
      fetchAsset: (key, dest) => st.download(key, dest),
      onProgress: (p) => {
        const now = Date.now();
        if (now - lastWrite < 1500 && p < 1) return;
        lastWrite = now;
        void job.updateProgress(Math.round(p * 100));
        void prisma.videoRender.update({ where: { id: render.id }, data: { progress: p * 0.95 } }).catch(() => {});
      },
    });
    await postProcess(raw, final, thumb, durationSec);

    const orgId = render.event.organizationId;
    const outputKey = keys.renderVideo(orgId, render.eventId, render.id);
    const thumbKey = keys.renderThumb(orgId, render.eventId, render.id);
    await st.putFile(outputKey, final, "video/mp4");
    await st.putFile(thumbKey, thumb, "image/jpeg");
    const { size } = await fs.stat(final);

    await prisma.$transaction(async (tx) => {
      await tx.videoRender.update({
        where: { id: render.id },
        data: { status: "COMPLETED", progress: 1, outputKey, thumbKey, sizeBytes: size, durationSec, finishedAt: new Date() },
      });
      // Regeneração: o novo vídeo assume a posição do anterior na playlist do telão
      if (render.replacesRenderId) {
        const prev = await tx.videoRender.findUnique({ where: { id: render.replacesRenderId } });
        if (prev?.published) {
          await tx.videoRender.update({ where: { id: prev.id }, data: { published: false } });
          await tx.videoRender.update({ where: { id: render.id }, data: { published: true, publishOrder: prev.publishOrder } });
        }
      }
    });
    console.log(`[worker] render ${render.id} concluído (${durationSec.toFixed(1)}s, ${(size / 1048576).toFixed(1)} MB)`);
    return { outputKey };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.videoRender.update({
      where: { id: render.id },
      data: { status: finalAttempt ? "FAILED" : "QUEUED", error: message.slice(0, 2000), progress: 0 },
    });
    console.error(`[worker] render ${render.id} falhou (tentativa ${job.attemptsMade + 1})`, message);
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function maintenance() {
  // Logotipos enviados há mais de 24h que nunca foram vinculados a nada
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const orphans = await prisma.mediaAsset.findMany({
    where: {
      createdAt: { lt: cutoff },
      sponsorshipLogoOf: { none: {} },
      companyLogoOf: { none: {} },
      eventLogoOf: { none: {} },
      eventCoverOf: { none: {} },
    },
    take: 500,
  });
  for (const a of orphans) {
    await storage().delete(a.originalKey).catch(() => {});
    await storage().delete(a.processedKey).catch(() => {});
    await prisma.mediaAsset.delete({ where: { id: a.id } }).catch(() => {});
  }
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (orphans.length || sessions.count) console.log(`[manutenção] ${orphans.length} assets órfãos, ${sessions.count} sessões expiradas removidos`);
}

async function main() {
  await getBundle(); // pré-aquecimento: o primeiro render não paga o custo do webpack
  const worker = new Worker<RenderJobData>(RENDER_QUEUE, processRender, {
    connection: redisConnection(),
    concurrency,
    lockDuration: 120_000,
    stalledInterval: 60_000,
  });
  worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} falhou:`, err.message));

  const mq = new Queue(MAINTENANCE_QUEUE, { connection: redisConnection() });
  await mq.upsertJobScheduler("hourly-cleanup", { every: 3600_000 }, { name: "cleanup" });
  const mw = new Worker(MAINTENANCE_QUEUE, maintenance, { connection: redisConnection(), concurrency: 1 });

  // Monitoramento simples de recursos do host
  const monitor = setInterval(() => {
    const mem = process.memoryUsage();
    console.log(
      `[monitor] load=${os.loadavg().map((l) => l.toFixed(2)).join("/")} rss=${(mem.rss / 1048576).toFixed(0)}MB livre=${(os.freemem() / 1048576).toFixed(0)}MB`,
    );
  }, 60_000);

  console.log(`[worker] pronto — concorrência ${concurrency}`);
  const shutdown = async () => {
    console.log("[worker] encerrando…");
    clearInterval(monitor);
    await Promise.allSettled([worker.close(), mw.close(), mq.close()]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] erro fatal", err);
  process.exit(1);
});
