import { NextResponse } from "next/server";
import type { Prisma, SponsorshipStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { sponsorshipCreateSchema } from "@/lib/validation";
import { createSponsorship } from "@/lib/services/sponsorships";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ eventId: string }> };
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "ARCHIVED"] as const;

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutraliza fórmulas (CSV injection) e escapa aspas
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Lista com filtros (?status=&categoryId=&q=&createdBy=me&sort=name|createdAt) e exportação (?format=csv).
 * Captadores enxergam apenas os patrocinadores que cadastraram.
 */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.view");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const where: Prisma.SponsorshipWhereInput = { eventId };
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status as SponsorshipStatus;
  const categoryId = url.searchParams.get("categoryId");
  if (categoryId) where.categoryId = categoryId;
  const q = url.searchParams.get("q")?.trim().slice(0, 80);
  if (q) where.displayName = { contains: q, mode: "insensitive" };
  if (!access.can("sponsorship.viewAll") || url.searchParams.get("createdBy") === "me") where.createdById = user.id;
  const sort = url.searchParams.get("sort") === "name" ? { displayName: "asc" as const } : { createdAt: "desc" as const };

  const rows = await prisma.sponsorship.findMany({
    where,
    orderBy: sort,
    take: 1000,
    include: {
      category: { select: { id: true, name: true, sortOrder: true } },
      createdBy: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
      logoAsset: { select: { processedKey: true, width: true, height: true } },
      company: { select: { contactName: true, contactEmail: true } },
    },
  });

  if (url.searchParams.get("format") === "csv") {
    const header = ["Patrocinador", "Categoria", "Status", "Origem", "Captador", "Revisado por", "Contato", "E-mail", "Logotipo", "Cadastrado em"];
    const lines = rows.map((r) =>
      [r.displayName, r.category?.name, r.status, r.source, r.createdBy?.name, r.reviewedBy?.name, r.company.contactName, r.company.contactEmail, r.logoAsset ? "sim" : "não", r.createdAt.toISOString()]
        .map(csvCell)
        .join(";"),
    );
    return new Response("﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="patrocinadores-${access.event.slug}.csv"`,
      },
    });
  }

  const st = storage();
  const sponsorships = await Promise.all(
    rows.map(async ({ logoAsset, company: _c, ...r }) => ({
      ...r,
      logoUrl: logoAsset ? await st.signedUrl(logoAsset.processedKey, { ttlSec: 3600 }) : null,
    })),
  );
  return NextResponse.json({ sponsorships });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "sponsorship.create");
  const data = sponsorshipCreateSchema.parse(await req.json());
  const sponsorship = await createSponsorship({
    organizationId: access.event.organizationId,
    eventId,
    userId: user.id,
    canReview: access.can("sponsorship.review"),
    ...data,
    source: data.companyId ? "LIBRARY" : "INTERNAL",
  });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "sponsorship.create", entity: "Sponsorship", entityId: sponsorship.id, data: { name: sponsorship.displayName, status: sponsorship.status }, ip: clientIp(req) });
  return NextResponse.json({ sponsorship }, { status: 201 });
});
