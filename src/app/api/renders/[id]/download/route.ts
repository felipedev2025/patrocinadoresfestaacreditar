import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { handler, notFound } from "@/lib/http";
import { storage } from "@/lib/storage";
import { slugify } from "@/lib/text";

/** Download do MP4 por URL temporária assinada (não expõe o storage diretamente). */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const r = await prisma.videoRender.findUnique({
    where: { id: (await params).id },
    include: { format: true, event: { select: { slug: true } }, sponsorship: { select: { displayName: true } }, category: { select: { name: true } } },
  });
  if (!r || !r.outputKey) throw notFound("Vídeo não disponível");
  await eventAccess(user, r.eventId, "render.view");
  const target = r.sponsorship?.displayName ?? r.category?.name ?? "todos";
  const name = `${r.event.slug}-${slugify(r.kind.toLowerCase())}-${slugify(target)}-${r.format.width}x${r.format.height}-v${r.version}.mp4`;
  const url = await storage().signedUrl(r.outputKey, { ttlSec: 600, downloadName: name });
  return NextResponse.redirect(new URL(url, process.env.APP_URL ?? "http://localhost:3000"), 302);
});
