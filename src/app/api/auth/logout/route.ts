import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { assertSameOrigin, handler } from "@/lib/http";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await destroySession();
  return NextResponse.json({ ok: true });
});
