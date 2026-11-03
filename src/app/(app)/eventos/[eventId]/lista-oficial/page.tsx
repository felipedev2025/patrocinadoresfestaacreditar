import { prisma } from "@/lib/db";
import { pageEventAccess } from "@/lib/page-access";
import { PageHeader } from "@/components/ui";
import { OfficialListManager } from "./OfficialListManager";

export const metadata = { title: "Lista oficial" };

export default async function OfficialListPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ lista?: string }> }) {
  const { eventId } = await params;
  const { lista } = await searchParams;
  const { access } = await pageEventAccess(eventId, "list.export");
  const lists = await prisma.importedList.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, _count: { select: { slots: true } } },
  });
  return (
    <>
      <PageHeader
        title="Lista oficial"
        subtitle="Importe a lista de patrocinadores do evento, encaixe os logotipos e confira o que falta."
      />
      <OfficialListManager
        eventId={eventId}
        lists={lists.map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt.toISOString(), total: l._count.slots }))}
        initialListId={lists.find((l) => l.id === lista)?.id ?? lists[0]?.id ?? null}
        canManage={access.can("list.manage")}
        maxMb={Number(process.env.UPLOAD_MAX_MB ?? 10)}
        aiEnabled={!!process.env.ANTHROPIC_API_KEY}
      />
    </>
  );
}
