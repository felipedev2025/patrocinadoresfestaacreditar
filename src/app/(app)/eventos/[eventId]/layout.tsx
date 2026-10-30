import { pageEventAccess } from "@/lib/page-access";
import { EventTabs } from "@/components/EventTabs";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { access } = await pageEventAccess(eventId);
  const tabs = [
    { href: `/eventos/${eventId}`, label: "Painel", show: true },
    { href: `/eventos/${eventId}/patrocinadores`, label: "Patrocinadores", show: true },
    { href: `/eventos/${eventId}/videos`, label: "Vídeos & Telão", show: access.can("render.view") },
    { href: `/eventos/${eventId}/configuracoes`, label: "Configurações", show: access.can("event.manage") || access.can("uploadLink.create") },
  ].filter((t) => t.show);
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-widest text-brand-300">{access.event.name} {access.event.year}</div>
      <EventTabs tabs={tabs} />
      {children}
    </div>
  );
}
