import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, badRequest, clientIp, handler } from "@/lib/http";
import { uploadLinkSchema } from "@/lib/validation";
import { randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ eventId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "uploadLink.create");
  const links = await prisma.uploadLink.findMany({
    where: { eventId, ...(access.can("event.manage") ? {} : { createdById: user.id }) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, label: true, expiresAt: true, maxUses: true, uses: true, revokedAt: true, createdAt: true,
      category: { select: { name: true } }, createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ links });
});

/** Gera link de autoatendimento. O token em claro é devolvido UMA vez; no banco fica apenas o hash. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "uploadLink.create");
  const data = uploadLinkSchema.parse(await req.json());
  if (data.categoryId && !(await prisma.sponsorCategory.findFirst({ where: { id: data.categoryId, eventId } }))) throw badRequest("Categoria inválida");
  const token = randomToken(24);
  const link = await prisma.uploadLink.create({
    data: {
      eventId,
      tokenHash: sha256(token),
      label: data.label ?? null,
      categoryId: data.categoryId ?? null,
      maxUses: data.maxUses,
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400_000) : null,
      createdById: user.id,
    },
  });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "uploadLink.create", entity: "UploadLink", entityId: link.id, data: { label: link.label, maxUses: link.maxUses }, ip: clientIp(req) });
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({ id: link.id, url: `${base}/enviar-logo/${access.event.slug}/${token}` }, { status: 201 });
});
