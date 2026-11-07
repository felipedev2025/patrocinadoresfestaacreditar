import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens").min(3).max(80);
const optDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .nullish()
  .transform((v) => (v ? new Date(v) : null));

export const eventCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  series: slug.optional(),
  edition: z.string().trim().max(60).nullish(),
  year: z.number().int().min(2000).max(2100),
  slug: slug.optional(),
  startsAt: optDate,
  endsAt: optDate,
  venue: z.string().trim().max(160).nullish(),
});

export const eventUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    edition: z.string().trim().max(60).nullable(),
    year: z.number().int().min(2000).max(2100),
    startsAt: optDate,
    endsAt: optDate,
    venue: z.string().trim().max(160).nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "FINISHED", "ARCHIVED"]),
    primaryColor: hex,
    secondaryColor: hex,
    accentColor: hex,
    textColor: hex,
    fontFamily: z.string().trim().regex(/^[A-Za-z0-9 \-]{2,40}$/),
    headline: z.string().trim().min(2).max(80),
    thankYouMessage: z.string().trim().min(2).max(160),
  })
  .partial();

export const duplicateEventSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  year: z.number().int().min(2000).max(2100),
  edition: z.string().trim().max(60).nullish(),
  slug: slug.optional(),
  copyMembers: z.boolean().default(true),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  displaySeconds: z.number().min(1).max(30).default(4),
  logoScale: z.number().min(0.4).max(1.6).default(1),
  appearances: z.number().int().min(1).max(5).default(1),
  animation: z.enum(["fade", "zoom", "slide", "spotlight"]).default("fade"),
  highlight: z.boolean().default(false),
  includeInCollective: z.boolean().default(true),
  includeIndividual: z.boolean().default(true),
  color: hex.default("#E09B12"),
});

export const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ORGANIZER", "CAPTADOR", "OPERATOR"]),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).nullish(),
  password: z.string().min(10).max(200),
  role: z.enum(["SUPER_ADMIN", "USER"]).default("USER"),
});

export const sponsorshipCreateSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120).optional(),
    companyId: z.string().cuid().optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    categoryId: z.string().cuid().nullish(),
    assetId: z.string().min(10).max(40).nullish(),
    logoScale: z.number().min(0.5).max(1.5).default(1),
    notes: z.string().trim().max(500).nullish(),
    approveNow: z.boolean().default(false), // organizador pode cadastrar já aprovado
  })
  .refine((v) => v.companyName || v.companyId, { message: "Informe o nome da empresa" });

export const sponsorshipUpdateSchema = z.object({
  action: z.enum(["approve", "reject", "archive", "restore", "edit"]),
  displayName: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().cuid().nullish(),
  assetId: z.string().min(10).max(40).optional(),
  logoScale: z.number().min(0.5).max(1.5).optional(),
  notes: z.string().trim().max(500).nullish(),
  rejectionReason: z.string().trim().max(300).nullish(),
});

export const uploadLinkSchema = z.object({
  label: z.string().trim().max(80).nullish(),
  categoryId: z.string().cuid().nullish(),
  expiresInDays: z.number().int().min(1).max(365).nullish(),
  maxUses: z.number().int().min(1).max(100).default(1),
});

export const publicSubmitSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(100).nullish(),
  contactEmail: z.string().trim().email().max(160).nullish().or(z.literal("")),
  assetId: z.string().min(10).max(40),
  website: z.string().max(0).optional(), // honeypot anti-robô: deve vir vazio
});

export const formatSchema = z.object({
  name: z.string().trim().min(2).max(60),
  width: z.number().int().min(320).max(7680).refine((n) => n % 2 === 0, "Largura deve ser par (exigência do H.264)"),
  height: z.number().int().min(320).max(7680).refine((n) => n % 2 === 0, "Altura deve ser par (exigência do H.264)"),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(30),
  safeMarginPct: z.number().min(0).max(20).default(5),
  notes: z.string().trim().max(300).nullish(),
});

export const renderCreateSchema = z.object({
  kind: z.enum(["COLLECTIVE", "CATEGORY", "INDIVIDUAL"]),
  templateId: z.string().cuid(),
  formatId: z.string().cuid(),
  sponsorshipId: z.string().cuid().nullish(),
  categoryId: z.string().cuid().nullish(),
  selectedIds: z.array(z.string().cuid()).max(500).nullish(),
  allIndividuals: z.boolean().default(false), // gera um vídeo individual para cada aprovado
  crf: z.number().int().min(10).max(35).nullish(),
  videoBitrate: z.string().regex(/^\d{1,3}(\.\d)?M$/, "Use o formato 8M, 12M…").nullish(),
  showSponsorNames: z.boolean().default(false), // nome escrito embaixo do logotipo no vídeo
});
