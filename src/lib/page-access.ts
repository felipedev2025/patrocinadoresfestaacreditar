import { notFound, redirect } from "next/navigation";
import { currentUser } from "./auth";
import { eventAccess, type Permission } from "./rbac";
import { HttpError } from "./http";

/** Versão para Server Components: converte erros de acesso em 404 / redirecionamento. */
export async function pageEventAccess(eventId: string, required?: Permission) {
  const user = await currentUser();
  if (!user) redirect("/login");
  try {
    const access = await eventAccess(user, eventId, required);
    return { user, access };
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) redirect(`/eventos/${eventId}`);
    if (e instanceof HttpError) notFound();
    throw e;
  }
}
