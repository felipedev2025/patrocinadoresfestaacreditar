import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, badRequest, clientIp, handler } from "@/lib/http";
import { slotAccess } from "@/lib/official-list/access";
import { moneySchema } from "@/lib/official-list/schema";
import { normalizeName } from "@/lib/matching";
import { attachAssetToSlot, linkSlotToSponsorship, unlinkSlot } from "@/lib/services/official-list";
import { audit } from "@/lib/audit";

const id = z.string().min(10).max(40);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }), // aceita a sugestão (logotipo e/ou patrocinador)
  z.object({ action: z.literal("reject") }), // recusa a sugestão
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("unlink") }),
  z.object({ action: z.literal("link"), sponsorshipId: id }), // vincula a um patrocinador já cadastrado
  z.object({ action: z.literal("attach"), assetId: id }), // encaixa um logotipo (ex.: arrastado da caixa "Não identificadas")
  z.object({
    action: z.literal("edit"),
    listName: z.string().trim().min(1).max(160).optional(),
    seller: optText(100),
    quotaValue: moneySchema.optional(),
    paymentMethod: optText(60),
    notes: optText(300),
  }),
]);

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ slotId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { slot, access, ctx } = await slotAccess(user, (await params).slotId, "list.manage");
  const body = schema.parse(await req.json());

  await prisma.$transaction(async (tx) => {
    const current = await tx.sponsorSlot.findUniqueOrThrow({ where: { id: slot.id } });
    switch (body.action) {
      case "confirm":
        if (current.pendingAssetId) await attachAssetToSlot(tx, ctx, current.id, current.pendingAssetId, current.matchConfidence);
        else if (current.status === "SUGGESTED" && current.sponsorshipId) await linkSlotToSponsorship(tx, ctx, current.id, current.sponsorshipId);
        else throw badRequest("Não há sugestão para confirmar nesta linha");
        break;
      case "reject":
        // O logotipo recusado volta para a caixa "Não identificadas"
        await tx.sponsorSlot.update({
          where: { id: current.id },
          data:
            current.status === "LINKED"
              ? { pendingAssetId: null }
              : { status: "AWAITING_LOGO", sponsorshipId: null, pendingAssetId: null, matchConfidence: null },
        });
        break;
      case "ignore":
        await tx.sponsorSlot.update({ where: { id: current.id }, data: { status: "IGNORED", pendingAssetId: null } });
        break;
      case "restore":
        await tx.sponsorSlot.update({ where: { id: current.id }, data: { status: current.sponsorshipId ? "LINKED" : "AWAITING_LOGO" } });
        break;
      case "unlink":
        await unlinkSlot(tx, ctx, current.id);
        break;
      case "link":
        await linkSlotToSponsorship(tx, ctx, current.id, body.sponsorshipId);
        break;
      case "attach":
        await attachAssetToSlot(tx, ctx, current.id, body.assetId, null);
        break;
      case "edit":
        await tx.sponsorSlot.update({
          where: { id: current.id },
          data: {
            ...(body.listName ? { listName: body.listName, normalizedName: normalizeName(body.listName) } : {}),
            ...(body.seller !== undefined ? { seller: body.seller } : {}),
            ...(body.quotaValue !== undefined ? { quotaValue: body.quotaValue } : {}),
            ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
          },
        });
        break;
    }
  });

  await audit({ organizationId: access.event.organizationId, eventId: ctx.eventId, userId: user.id, action: `slot.${body.action}`, entity: "SponsorSlot", entityId: slot.id, data: body, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
});
