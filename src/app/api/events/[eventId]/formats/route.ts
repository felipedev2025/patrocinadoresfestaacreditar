import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { eventAccess } from "@/lib/rbac";
import { assertSameOrigin, clientIp, conflict, handler } from "@/lib/http";
import { formatSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/** Cadastro de painel de LED / formato personalizado com a resolução real do equipamento. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { eventId } = await params;
  const access = await eventAccess(user, eventId, "event.manage");
  const data = formatSchema.parse(await req.json());
  if (await prisma.displayFormat.findUnique({ where: { eventId_name: { eventId, name: data.name } } })) throw conflict("Já existe um formato com este nome");
  const format = await prisma.displayFormat.create({ data: { ...data, eventId } });
  await audit({ organizationId: access.event.organizationId, eventId, userId: user.id, action: "format.create", entity: "DisplayFormat", entityId: format.id, data, ip: clientIp(req) });
  return NextResponse.json({ format }, { status: 201 });
});
