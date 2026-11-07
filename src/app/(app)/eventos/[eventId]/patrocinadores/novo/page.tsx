import { prisma } from "@/lib/db";
import { pageEventAccess } from "@/lib/page-access";
import { storage } from "@/lib/storage";
import { reelEventOf } from "@/lib/preview-props";
import { PageHeader } from "@/components/ui";
import { SponsorForm } from "./SponsorForm";

export const metadata = { title: "Adicionar patrocinador" };

export default async function NewSponsorPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { access } = await pageEventAccess(eventId, "sponsorship.create");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { logoAsset: { select: { processedKey: true } }, categories: { orderBy: { sortOrder: "asc" } } },
  });
  const logoUrl = event.logoAsset ? await storage().signedUrl(event.logoAsset.processedKey) : null;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Adicionar patrocinador" subtitle="Nome, logotipo e categoria. Leva menos de um minuto." />
      <SponsorForm
        eventId={eventId}
        reelEvent={reelEventOf(event, logoUrl)}
        categories={event.categories.map(({ id, name, color, sortOrder, displaySeconds, logoScale, highlight, animation, appearances }) => ({ id, name, color, sortOrder, displaySeconds, logoScale, highlight, animation, appearances }))}
        canApprove={access.can("sponsorship.review")}
        maxMb={Number(process.env.UPLOAD_MAX_MB ?? 10)}
      />
    </div>
  );
}
