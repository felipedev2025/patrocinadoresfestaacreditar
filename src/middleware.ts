import { NextResponse, type NextRequest } from "next/server";

/**
 * Barreira leve nas páginas privadas: sem cookie de sessão => /login.
 * A validação real da sessão e das permissões acontece no servidor (currentUser / eventAccess).
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("pt_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/eventos/:path*", "/usuarios/:path*"] };
