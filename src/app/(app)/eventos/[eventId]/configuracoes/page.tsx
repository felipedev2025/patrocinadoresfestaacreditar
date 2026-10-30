import { prisma } from "@/lib/db";
import { pageEventAccess } from "@/lib/page-access";
import { storage } from "@/lib/storage";
import { PageHeader } from "@/components/ui";
import { IdentityForm, CategoriesEditor, FormatsEditor, MembersEditor, UploadLinksEditor, DuplicateEdition } from "./Editors";

export const metadata = { title: "Configurações" };

export default async function SettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { user, access } = await pageEventAccess(eventId, "event.view");
  const manage = access.can("event.manage");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      logoAsset: { select: { processedKey: true } },
      categories: { orderBy: { sortOrder: "asc" } },
      formats: { orderBy: { createdAt: "asc" } },
      members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const logoUrl = event.logoAsset ? await storage().signedUrl(event.logoAsset.processedKey) : null;
  return (
    <>
      <PageHeader title="Configurações" subtitle="Identidade visual, categorias, telões, equipe e links de envio." />
      <div className="space-y-6">
        {manage ? (
          <>
            <IdentityForm
              eventId={eventId}
              logoUrl={logoUrl}
              initial={{
                name: event.name,
                edition: event.edition ?? "",
                year: event.year,
                venue: event.venue ?? "",
                status: event.status,
                primaryColor: event.primaryColor,
                secondaryColor: event.secondaryColor,
                accentColor: event.accentColor,
                textColor: event.textColor,
                fontFamily: event.fontFamily,
                headline: event.headline,
                thankYouMessage: event.thankYouMessage,
              }}
            />
            <CategoriesEditor eventId={eventId} categories={event.categories} />
            <FormatsEditor eventId={eventId} formats={event.formats} />
            <MembersEditor
              eventId={eventId}
              isAdmin={access.isAdmin}
              members={event.members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role }))}
            />
          </>
        ) : null}
        {access.can("uploadLink.create") ? <UploadLinksEditor eventId={eventId} categories={event.categories.map((c) => ({ id: c.id, name: c.name }))} /> : null}
        {user.role === "SUPER_ADMIN" ? <DuplicateEdition eventId={eventId} name={event.name} year={event.year} /> : null}
      </div>
    </>
  );
}
