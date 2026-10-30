/**
 * Seed idempotente: organização, administrador geral e biblioteca de templates de sistema.
 * Não cria patrocinadores fictícios.
 */
import "../worker/load-env";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { TEMPLATE_PRESETS } from "../src/remotion/presets";
import { normalizeConfig } from "../src/remotion/types";
import { slugify } from "../src/lib/text";

const prisma = new PrismaClient();

async function main() {
  const orgName = process.env.ORG_NAME ?? "Minha Organização";
  const org = await prisma.organization.upsert({ where: { slug: slugify(orgName) }, create: { name: orgName, slug: slugify(orgName) }, update: {} });

  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 10) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 10 caracteres) no .env");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { organizationId: org.id, name: process.env.ADMIN_NAME ?? "Administrador", email, role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`✔ Administrador criado: ${email}`);
  } else {
    console.log(`• Administrador já existe: ${email}`);
  }

  for (const t of TEMPLATE_PRESETS) {
    const config = normalizeConfig(t.config) as unknown as Prisma.InputJsonValue;
    await prisma.videoTemplate.upsert({
      where: { key: t.key },
      create: { key: t.key, name: t.name, description: t.description, style: t.style, config, isSystem: true },
      update: { name: t.name, description: t.description, style: t.style, config },
    });
  }
  console.log(`✔ ${TEMPLATE_PRESETS.length} templates de sistema`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
