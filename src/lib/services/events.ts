import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { randomToken } from "../crypto";
import { slugify } from "../text";
import { conflict } from "../http";
import { CATEGORY_PRESETS, FORMAT_PRESETS } from "@/remotion/presets";

async function uniqueSlug(tx: Prisma.TransactionClient, base: string) {
  let slug = base;
  for (let i = 2; await tx.event.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** Cria uma edição com categorias e formatos de telão padrão. */
export async function createEvent(
  organizationId: string,
  userId: string,
  data: { name: string; year: number; series?: string; edition?: string | null; slug?: string; startsAt?: Date | null; endsAt?: Date | null; venue?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const series = data.series ?? slugify(data.name);
    const desired = data.slug ?? slugify(`${data.name}-${data.year}`);
    if (data.slug && (await tx.event.findUnique({ where: { slug: data.slug } }))) throw conflict("Já existe um evento com este endereço (slug)");
    const slug = await uniqueSlug(tx, desired);
    const event = await tx.event.create({
      data: {
        organizationId,
        series,
        name: data.name,
        year: data.year,
        edition: data.edition ?? null,
        slug,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        venue: data.venue ?? null,
        screenKey: randomToken(18),
        members: { create: { userId, role: "ORGANIZER" } },
        categories: { create: CATEGORY_PRESETS.map((c) => ({ ...c })) },
        formats: { create: FORMAT_PRESETS.map((f) => ({ ...f, isPreset: true })) },
      },
    });
    return event;
  });
}

/**
 * Duplica a configuração de uma edição (identidade, categorias, formatos, membros).
 * Patrocínios NÃO são copiados: precisam ser reconfirmados (via biblioteca) na nova edição.
 */
export async function duplicateEvent(
  sourceId: string,
  userId: string,
  data: { name?: string; year: number; edition?: string | null; slug?: string; copyMembers: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const src = await tx.event.findUniqueOrThrow({ where: { id: sourceId }, include: { categories: true, formats: true, members: true } });
    const name = data.name ?? src.name;
    const slug = await uniqueSlug(tx, data.slug ?? slugify(`${name}-${data.year}`));
    const members = new Map<string, (typeof src.members)[number]["role"]>();
    if (data.copyMembers) src.members.forEach((m) => members.set(m.userId, m.role));
    members.set(userId, "ORGANIZER");
    return tx.event.create({
      data: {
        organizationId: src.organizationId,
        series: src.series,
        name,
        year: data.year,
        edition: data.edition ?? null,
        slug,
        venue: src.venue,
        primaryColor: src.primaryColor,
        secondaryColor: src.secondaryColor,
        accentColor: src.accentColor,
        textColor: src.textColor,
        fontFamily: src.fontFamily,
        headline: src.headline,
        thankYouMessage: src.thankYouMessage,
        logoAssetId: src.logoAssetId,
        coverAssetId: src.coverAssetId,
        screenKey: randomToken(18),
        duplicatedFromId: src.id,
        members: { create: [...members].map(([uid, role]) => ({ userId: uid, role })) },
        categories: {
          create: src.categories.map(({ id: _i, eventId: _e, createdAt: _c, ...c }) => c),
        },
        formats: {
          create: src.formats.map(({ id: _i, eventId: _e, createdAt: _c, ...f }) => f),
        },
      },
    });
  });
}
