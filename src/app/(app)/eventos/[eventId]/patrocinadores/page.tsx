import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageEventAccess } from "@/lib/page-access";
import { PageHeader } from "@/components/ui";
import { SponsorList } from "./SponsorList";
import { LibrarySuggestions } from "./LibrarySuggestions";

export const metadata = { title: "Patrocinadores" };

export default async function SponsorsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ status?: string }> }) {
  const { eventId } = await params;
  const { status } = await searchParams;
  const { user, access } = await pageEventAccess(eventId, "event.view");
  const categories = await prisma.sponsorCategory.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader
        title="Patrocinadores"
        subtitle={access.can("sponsorship.viewAll") ? "Aprove, edite e organize os patrocinadores desta edição." : "Patrocinadores cadastrados por você."}
        actions={
          <>
            {access.can("sponsorship.create") ? <Link href={`/eventos/${eventId}/patrocinadores/novo`} className="btn-primary">+ Adicionar</Link> : null}
            {access.can("sponsorship.viewAll") ? <a href={`/api/events/${eventId}/sponsorships?format=csv`} className="btn-secondary">Exportar CSV</a> : null}
          </>
        }
      />
      {access.can("sponsorship.create") ? <LibrarySuggestions eventId={eventId} categories={categories} /> : null}
      <SponsorList
        eventId={eventId}
        categories={categories}
        initialStatus={status ?? ""}
        canReview={access.can("sponsorship.review")}
        canDelete={access.can("sponsorship.delete")}
        canReorder={access.can("list.manage")}
        currentUserId={user.id}
        maxMb={Number(process.env.UPLOAD_MAX_MB ?? 10)}
      />
    </>
  );
}
