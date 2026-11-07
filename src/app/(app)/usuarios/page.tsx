import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { UsersManager } from "./UsersManager";

export const metadata = { title: "Usuários" };

export default async function UsersPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/eventos");
  return (
    <>
      <PageHeader title="Usuários" subtitle="Cadastre captadores, organizadores e operadores. Depois, vincule-os aos eventos em Configurações." />
      <UsersManager currentUserId={user.id} />
    </>
  );
}
