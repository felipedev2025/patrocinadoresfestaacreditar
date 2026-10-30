import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageEventAccess } from "@/lib/page-access";
import { computeOutdated } from "@/lib/services/renders";
import { PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Painel do evento" };

export default async function EventDashboard({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { user, access } = await pageEventAccess(eventId, "event.view");
  const seeAll = access.can("sponsorship.viewAll");
  const scope = seeAll ? { eventId } : { eventId, createdById: user.id };

  // Agregações no banco (GROUP BY) em vez de carregar todos os registros
  const [byStatus, byCategory, byCaptador, missingLogo, categories, renders, captadores, history] = await Promise.all([
    prisma.sponsorship.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.sponsorship.groupBy({ by: ["categoryId"], where: { ...scope, status: { in: ["APPROVED", "PENDING"] } }, _count: true }),
    seeAll ? prisma.sponsorship.groupBy({ by: ["createdById", "status"], where: { eventId }, _count: true }) : Promise.resolve([]),
    prisma.sponsorship.count({ where: { ...scope, logoAssetId: null, status: { not: "ARCHIVED" } } }),
    prisma.sponsorCategory.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
    access.can("render.view") ? prisma.videoRender.findMany({ where: { eventId }, orderBy: { queuedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    seeAll ? prisma.user.findMany({ where: { memberships: { some: { eventId } } }, select: { id: true, name: true } }) : Promise.resolve([]),
    prisma.event.findMany({
      where: { organizationId: access.event.organizationId, series: (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { series: true } })).series },
      orderBy: { year: "desc" },
      select: { id: true, year: true, name: true, _count: { select: { sponsorships: { where: { status: "APPROVED" } } } } },
    }),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const total = byStatus.reduce((s, b) => s + b._count, 0);
  const completed = renders.filter((r) => r.status === "COMPLETED");
  const outdated = await computeOutdated(eventId, completed);
  const inProgress = renders.filter((r) => r.status === "QUEUED" || r.status === "RENDERING").length;
  const capName = new Map(captadores.map((c) => [c.id, c.name]));
  const perCaptador = new Map<string, { name: string; total: number; approved: number }>();
  for (const row of byCaptador) {
    const key = row.createdById ?? "externo";
    const cur = perCaptador.get(key) ?? { name: row.createdById ? capName.get(row.createdById) ?? "Usuário removido" : "Link público", total: 0, approved: 0 };
    cur.total += row._count;
    if (row.status === "APPROVED") cur.approved += row._count;
    perCaptador.set(key, cur);
  }
  const maxCat = Math.max(1, ...byCategory.map((c) => c._count));
  const base = `/eventos/${eventId}`;

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle={seeAll ? "Visão geral dos patrocínios e vídeos desta edição." : "Acompanhe os patrocinadores que você cadastrou."}
        actions={
          <>
            {access.can("sponsorship.create") ? <Link href={`${base}/patrocinadores/novo`} className="btn-primary">+ Adicionar patrocinador</Link> : null}
            {access.can("render.create") ? <Link href={`${base}/videos`} className="btn-secondary">Gerar vídeos</Link> : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Cadastrados" value={total} href={`${base}/patrocinadores`} />
        <StatCard label="Pendentes" value={count("PENDING")} tone="warn" href={`${base}/patrocinadores?status=PENDING`} />
        <StatCard label="Aprovados" value={count("APPROVED")} tone="ok" href={`${base}/patrocinadores?status=APPROVED`} />
        <StatCard label="Sem logotipo" value={missingLogo} tone={missingLogo ? "warn" : "default"} />
        {access.can("render.view") ? (
          <>
            <StatCard label="Vídeos gerados" value={completed.length} tone="brand" href={`${base}/videos`} />
            <StatCard label="Desatualizados" value={outdated.size} tone={outdated.size ? "warn" : "default"} hint={outdated.size ? "Regenere com um clique" : "Tudo em dia"} href={`${base}/videos`} />
            <StatCard label="Em processamento" value={inProgress} />
            <StatCard label="Rejeitados" value={count("REJECTED")} />
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 font-semibold">Por categoria <span className="text-xs font-normal text-zinc-500">(aprovados + pendentes)</span></h2>
          <ul className="space-y-3">
            {categories.map((c) => {
              const n = byCategory.find((b) => b.categoryId === c.id)?._count ?? 0;
              return (
                <li key={c.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c.name}</span><span className="tabular-nums text-zinc-400">{n}</span></div>
                  <div className="h-2 rounded-full bg-white/5"><div className="h-2 rounded-full" style={{ width: `${(n / maxCat) * 100}%`, background: c.color }} /></div>
                </li>
              );
            })}
            {(() => {
              const n = byCategory.find((b) => b.categoryId === null)?._count ?? 0;
              return n ? <li className="text-sm text-amber-300">{n} sem categoria definida</li> : null;
            })()}
          </ul>
        </section>

        {seeAll ? (
          <section className="card">
            <h2 className="mb-4 font-semibold">Por captador</h2>
            {perCaptador.size === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum cadastro ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="pb-2">Captador</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Aprovados</th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {[...perCaptador.values()].sort((a, b) => b.total - a.total).map((c) => (
                    <tr key={c.name}><td className="py-2">{c.name}</td><td className="py-2 text-right tabular-nums">{c.total}</td><td className="py-2 text-right tabular-nums text-emerald-300">{c.approved}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}

        <section className="card lg:col-span-2">
          <h2 className="mb-4 font-semibold">Histórico por edição</h2>
          <div className="flex flex-wrap gap-3">
            {history.map((h) => (
              <Link key={h.id} href={`/eventos/${h.id}`} className={`rounded-xl border px-4 py-3 text-sm ${h.id === eventId ? "border-brand-400/60 bg-brand-400/10" : "border-white/10 hover:border-white/25"}`}>
                <div className="font-semibold">{h.name} {h.year}</div>
                <div className="text-zinc-400">{h._count.sponsorships} aprovados</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
