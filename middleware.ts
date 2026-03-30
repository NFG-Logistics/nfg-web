import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Returns true when the request carries any sb-…-auth-token cookie
 * (including chunked variants like .0, .1, …).
 */
function hasAuthCookies(req: NextRequest): boolean {
  return req.cookies.getAll().some(({ name }) => name.startsWith("sb-"));
}

/**
 * Delete every sb-* cookie on the response so the browser never retains
 * stale tokens that trigger an infinite refresh-retry loop.
 */
function deleteAuthCookies(req: NextRequest, res: NextResponse): void {
  req.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-")) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  });
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isApiRoute = path.startsWith("/api/");

  // ── Fast-path: /login with no auth cookies → skip Supabase entirely ──
  if (isLoginPage && !hasAuthCookies(request)) {
    return NextResponse.next();
  }

  // ── Build Supabase server client with cookie bridge ──────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1. Mirror into the request so downstream Server Components see them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // 2. Re-create the response so the Set-Cookie headers are included
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Validate session — this also refreshes expired tokens ────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Let API routes through (they do their own auth checks)
  if (isApiRoute) {
    return supabaseResponse;
  }

  // ── Routing logic ────────────────────────────────────────────────────

  // Not authenticated + not on login → redirect to /login & nuke stale cookies
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    deleteAuthCookies(request, redirect);
    return redirect;
  }

  // Not authenticated + on login + has stale cookies → nuke them
  if (!user && isLoginPage) {
    deleteAuthCookies(request, supabaseResponse);
    return supabaseResponse;
  }

  // Authenticated + on login → redirect to dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirect.cookies.set(c.name, c.value, c)
    );
    return redirect;
  }

  // Authenticated + normal page → pass through with refreshed cookies
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
