import { prisma } from "@/lib/db";
import { pageEventAccess } from "@/lib/page-access";
import { PageHeader } from "@/components/ui";
import { VideoStudio } from "./VideoStudio";

export const metadata = { title: "Vídeos & Telão" };

export default async function VideosPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { access } = await pageEventAccess(eventId, "render.view");
  const [event, templates, approved] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { slug: true, screenKey: true, formats: { orderBy: { createdAt: "asc" } }, categories: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.videoTemplate.findMany({ where: { OR: [{ organizationId: null }, { organizationId: access.event.organizationId }] }, orderBy: { createdAt: "asc" } }),
    prisma.sponsorship.findMany({
      where: { eventId, status: "APPROVED", logoAssetId: { not: null } },
      orderBy: [{ category: { sortOrder: "asc" } }, { displayName: "asc" }],
      select: { id: true, displayName: true, category: { select: { name: true } } },
    }),
  ]);
  const screenPath = access.can("screen.operate") ? `/telao/${event.slug}?k=${event.screenKey}` : null;
  return (
    <>
      <PageHeader title="Vídeos & Telão" subtitle="Gere vídeos MP4 no servidor, acompanhe a renderização e publique no telão." />
      <VideoStudio
        eventId={eventId}
        canCreate={access.can("render.create")}
        canOperate={access.can("screen.operate")}
        screenPath={screenPath}
        templates={templates.map((t) => ({ id: t.id, name: t.name, description: t.description, style: t.style }))}
        formats={event.formats.map((f) => ({ id: f.id, name: f.name, width: f.width, height: f.height, fps: f.fps }))}
        categories={event.categories}
        sponsors={approved.map((s) => ({ id: s.id, name: s.displayName, category: s.category?.name ?? null }))}
      />
    </>
  );
}
