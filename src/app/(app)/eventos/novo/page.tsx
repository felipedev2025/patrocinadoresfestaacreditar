import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewEventForm } from "./NewEventForm";

export const metadata = { title: "Novo evento" };

export default async function NewEventPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/eventos");
  const previous = await prisma.event.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ year: "desc" }],
    select: { id: true, name: true, year: true },
  });
  return (
    <>
      <PageHeader title="Novo evento" subtitle="Crie uma edição do zero ou duplique a configuração de uma edição anterior." />
      <NewEventForm previous={previous} />
    </>
  );
}
