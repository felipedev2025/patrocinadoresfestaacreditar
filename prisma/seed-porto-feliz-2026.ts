/**
 * Cadastra a edição real "9º Porto Feliz Fest Show" (07 e 08/11/2026, CEMEX — Porto Feliz/SP),
 * com identidade visual baseada no cartaz oficial (madeira, laranja e dourado).
 * Idempotente: pode ser executado mais de uma vez.
 *
 * Realização e parceiros institucionais entram como cadastros PENDENTES e SEM logotipo:
 * os arquivos oficiais devem ser enviados pelos captadores ou pelo link de autoatendimento.
 */
import "../worker/load-env";
import { PrismaClient } from "@prisma/client";
import { createEvent } from "../src/lib/services/events";
import { normalizeCompanyName } from "../src/lib/text";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("Execute primeiro: npm run db:seed");

  let event = await prisma.event.findUnique({ where: { slug: "porto-feliz-fest-show-2026" } });
  if (!event) {
    event = await createEvent(admin.organizationId, admin.id, {
      name: "Porto Feliz Fest Show",
      series: "porto-feliz-fest-show",
      year: 2026,
      edition: "9ª edição",
      slug: "porto-feliz-fest-show-2026",
      startsAt: new Date("2026-11-07T18:00:00-03:00"),
      endsAt: new Date("2026-11-08T23:00:00-03:00"),
      venue: "CEMEX — Av. Getúlio Vargas, s/n, Bambu — Porto Feliz/SP",
    });
    console.log("✔ Evento criado:", event.slug);
  } else {
    console.log("• Evento já existe:", event.slug);
  }

  await prisma.event.update({
    where: { id: event.id },
    data: {
      status: "ACTIVE",
      primaryColor: "#1E120A", // marrom escuro (madeira)
      secondaryColor: "#5A3620", // marrom médio
      accentColor: "#F29A1F", // laranja/dourado das faixas do cartaz
      textColor: "#FFF4E0", // creme
      headline: "OBRIGADO PELO APOIO À SOLIDARIEDADE",
      thankYouMessage: "Juntos pela Associação Acreditar e pelas famílias atendidas. Obrigado!",
    },
  });

  const cat = (name: string) => prisma.sponsorCategory.findUnique({ where: { eventId_name: { eventId: event!.id, name } } });
  const realizacao = await cat("Realização");
  const institucional = await cat("Parceiro Institucional");

  const entries: { name: string; categoryId: string | undefined; notes: string }[] = [
    { name: "Associação Acreditar", categoryId: realizacao?.id, notes: "Realização — apoio a pessoas com câncer em Porto Feliz." },
    { name: "Hospital Amaral Carvalho", categoryId: institucional?.id, notes: "Parceria — Hospital do Câncer de Jaú (conferir se a arte deve citar os dois nomes)." },
    { name: "Prefeitura de Porto Feliz", categoryId: institucional?.id, notes: "Apoio institucional." },
  ];
  for (const e of entries) {
    const normalizedName = normalizeCompanyName(e.name);
    const company = await prisma.company.upsert({
      where: { organizationId_normalizedName: { organizationId: admin.organizationId, normalizedName } },
      create: { organizationId: admin.organizationId, name: e.name, normalizedName },
      update: {},
    });
    await prisma.sponsorship.upsert({
      where: { eventId_companyId: { eventId: event.id, companyId: company.id } },
      create: { eventId: event.id, companyId: company.id, displayName: e.name, categoryId: e.categoryId ?? null, notes: e.notes, createdById: admin.id, logoAssetId: company.logoAssetId },
      update: {},
    });
  }
  console.log(`✔ ${entries.length} parceiros cadastrados (pendentes de logotipo)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
