import { prisma } from "../db";
import { sha256 } from "../crypto";
import { HttpError } from "../http";

/** Resolve e valida um link público (existência, evento, revogação, expiração, limite de uso). */
export async function resolveUploadLink(slug: string, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "Link inválido");
  const link = await prisma.uploadLink.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      event: { select: { id: true, slug: true, name: true, year: true, organizationId: true, status: true, primaryColor: true, accentColor: true, logoAssetId: true } },
      category: { select: { id: true, name: true } },
    },
  });
  if (!link || link.event.slug !== slug) throw new HttpError(404, "Link inválido");
  if (link.revokedAt) throw new HttpError(410, "Este link foi desativado. Fale com quem enviou o convite.");
  if (link.expiresAt && link.expiresAt < new Date()) throw new HttpError(410, "Este link expirou. Solicite um novo.");
  if (link.uses >= link.maxUses) throw new HttpError(410, "Este link já foi utilizado.");
  if (link.event.status === "ARCHIVED" || link.event.status === "FINISHED") throw new HttpError(410, "Este evento não está mais recebendo cadastros.");
  return link;
}
