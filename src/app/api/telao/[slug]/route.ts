import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { storage } from "@/lib/storage";

/**
 * Playlist do telão (vídeos publicados em ordem). Protegida pela chave do telão (?k=).
 * As URLs assinadas duram 12h; o player atualiza a playlist periodicamente e usa
 * o id + versão de cada vídeo como chave de cache local.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!(await rateLimit(`telao:${clientIp(req)}`, 240, 3600))) return NextResponse.json({ error: "rate" }, { status: 429 });
  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true, name: true, year: true, screenKey: true, primaryColor: true } });
  if (!event || !k || !safeEqual(event.screenKey, k)) return NextResponse.json({ error: "Telão não encontrado" }, { status: 404 });
  const renders = await prisma.videoRender.findMany({
    where: { eventId: event.id, published: true, status: "COMPLETED", outputKey: { not: null } },
    orderBy: [{ publishOrder: "asc" }, { finishedAt: "asc" }],
    select: { id: true, version: true, outputKey: true, durationSec: true, finishedAt: true },
  });
  const st = storage();
  const items = await Promise.all(
    renders.map(async (r) => ({
      id: r.id,
      cacheKey: `${r.id}-v${r.version}`,
      url: await st.signedUrl(r.outputKey!, { ttlSec: 12 * 3600 }),
      durationSec: r.durationSec,
    })),
  );
  return NextResponse.json(
    { event: { name: event.name, year: event.year, background: event.primaryColor }, items, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
