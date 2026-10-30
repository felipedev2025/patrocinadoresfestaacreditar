import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, handler } from "@/lib/http";
import { createSponsorship } from "@/lib/services/sponsorships";
import { normalizeCompanyName } from "@/lib/text";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * Biblioteca de patrocinadores: empresas que já participaram de eventos da organização,
 * com histórico de participação. ?q= filtra por nome; ?suggest=1 traz as da mesma série
 * (ex.: Porto Fest de anos anteriores) que ainda não estão nesta edição.
 */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "sponsorship.create");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const suggest = url.searchParams.get("suggest") === "1";
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { series: true } });

  const companies = await prisma.company.findMany({
    where: {
      organizationId: access.event.organizationId,
      ...(q ? { normalizedName: { contains: normalizeCompanyName(q) } } : {}),
      ...(suggest
        ? { sponsorships: { some: { status: "APPROVED", event: { series: event.series, id: { not: eventId } } }, none: { eventId } } }
        : {}),
    },
    take: suggest ? 200 : 15,
    orderBy: { name: "asc" },
    include: {
      logoAsset: { select: { processedKey: true } },
      sponsorships: {
        select: { eventId: true, status: true, category: { select: { name: true } }, event: { select: { name: true, year: true } } },
        orderBy: { event: { year: "desc" } },
      },
    },
  });

  const st = storage();
  const result = await Promise.all(
    companies.map(async (c) => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logoAsset ? await st.signedUrl(c.logoAsset.processedKey) : null,
      inThisEvent: c.sponsorships.some((s) => s.eventId === eventId),
      history: c.sponsorships
        .filter((s) => s.eventId !== eventId)
        .map((s) => ({ event: s.event.name, year: s.event.year, category: s.category?.name ?? null, status: s.status })),
    })),
  );
  return NextResponse.json({ companies: result });
});

/** Reaproveita empresas da biblioteca: cria participações PENDENTES (precisam de confirmação). */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "sponsorship.create");
  const { companyIds, categoryId } = z
    .object({ companyIds: z.array(z.string().cuid()).min(1).max(200), categoryId: z.string().cuid().nullish() })
    .parse(await req.json());

  const created: string[] = [];
  const skipped: string[] = [];
  for (const companyId of companyIds) {
    try {
      const s = await createSponsorship({
        organizationId: access.event.organizationId,
        eventId,
        userId: user.id,
        canReview: access.can("sponsorship.review"),
        companyId,
        categoryId: categoryId ?? null,
        source: "LIBRARY",
      });
      created.push(s.id);
    } catch (e) {
      if (e instanceof HttpError) skipped.push(companyId);
      else throw e;
    }
  }
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "library.import", entity: "Sponsorship", data: { created: created.length, skipped: skipped.length }, ip: clientIp(req) });
  return NextResponse.json({ created: created.length, skipped: skipped.length }, { status: 201 });
});
