import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, handler, tooMany } from "@/lib/http";
import { createImageAsset, readUpload } from "@/lib/services/assets";
import { rateLimit } from "@/lib/redis";
import { audit } from "@/lib/audit";

/** Upload do logotipo oficial ou da capa do evento (campo "kind": logo | cover). */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.manage");
  if (!(await rateLimit(`upload:user:${user.id}`, 60, 600))) throw tooMany();
  const { file, form } = await readUpload(req);
  const kind = form.get("kind") === "cover" ? "EVENT_COVER" : form.get("kind") === "logo" ? "EVENT_LOGO" : null;
  if (!kind) throw badRequest("Tipo de imagem inválido");
  const asset = await createImageAsset({
    file,
    organizationId: access.event.organizationId,
    eventId,
    kind,
    removeBackground: form.get("removeBackground") === "true",
    createdById: user.id,
  });
  await prisma.event.update({ where: { id: eventId }, data: kind === "EVENT_LOGO" ? { logoAssetId: asset.id } : { coverAssetId: asset.id } });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: `event.${kind === "EVENT_LOGO" ? "logo" : "cover"}`, entity: "MediaAsset", entityId: asset.id, ip: clientIp(req) });
  return NextResponse.json({ assetId: asset.id }, { status: 201 });
});
