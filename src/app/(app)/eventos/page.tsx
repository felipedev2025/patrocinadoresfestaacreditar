import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { EmptyState, PageHeader, Badge } from "@/components/ui";

export const metadata = { title: "Eventos" };

const STATUS: Record<string, string> = { DRAFT: "Rascunho", ACTIVE: "Ativo", FINISHED: "Encerrado", ARCHIVED: "Arquivado" };

export default async function EventsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "SUPER_ADMIN";
  const events = await prisma.event.findMany({
    where: { organizationId: user.organizationId, ...(isAdmin ? {} : { members: { some: { userId: user.id } } }) },
    orderBy: [{ year: "desc" }, { name: "asc" }],
    include: {
      members: { where: { userId: user.id }, select: { role: true } },
      _count: { select: { sponsorships: true } },
    },
  });
  const roleLabel = { ORGANIZER: "Organizador", CAPTADOR: "Captador", OPERATOR: "Operador de telão" } as const;

  return (
    <>
      <PageHeader
        title="Eventos"
        subtitle="Selecione o evento para cadastrar patrocinadores ou gerar vídeos."
        actions={isAdmin ? <Link href="/eventos/novo" className="btn-primary">+ Novo evento</Link> : null}
      />
      {events.length === 0 ? (
        <EmptyState title="Nenhum evento disponível" text={isAdmin ? "Crie a primeira edição para começar." : "Peça ao organizador para vincular você a um evento."} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Link key={e.id} href={`/eventos/${e.id}`} className="card group relative overflow-hidden transition hover:border-brand-400/50">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${e.accentColor}, ${e.secondaryColor})` }} />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold group-hover:text-brand-300">{e.name} {e.year}</div>
                  <div className="text-sm text-zinc-400">{[e.edition, e.venue].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge className="bg-white/5 text-zinc-300 ring-white/15">{STATUS[e.status]}</Badge>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-zinc-400">{e._count.sponsorships} patrocinador(es)</span>
                <span className="text-xs text-zinc-500">{e.members[0] ? roleLabel[e.members[0].role] : "Administrador"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
