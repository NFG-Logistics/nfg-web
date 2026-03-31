import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight middleware — cookie-presence gate only.
 *
 * Only redirects users with ZERO auth cookies away from protected pages.
 * Does NOT redirect /login → /dashboard (that is handled client-side
 * to avoid redirect loops when cookies exist but the session is expired).
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";

  const hasSession = request.cookies
    .getAll()
    .some(({ name }) => name.includes("-auth-token"));

  if (!hasSession && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
