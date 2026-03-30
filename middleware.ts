import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isApiRoute = path.startsWith("/api/");

  // Fast-path: /login with zero sb-* cookies → nothing to validate
  if (
    isLoginPage &&
    !request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))
  ) {
    return NextResponse.next();
  }

  // ── Accumulator for ALL cookies set during the Supabase auth flow ────
  // This is the critical fix: setAll() can be called MULTIPLE times during
  // a single getUser() (e.g. once for token refresh, once for session save).
  // Each call must ADD to the list — NOT recreate the response and lose
  // cookies from earlier calls.  We collect them all, then apply once.
  const cookiesToApply: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Mirror into the request so downstream Server Components see them
            request.cookies.set(name, value);
            // Accumulate for the response
            cookiesToApply.push({ name, value, options: options as Record<string, unknown> });
          });
        },
      },
    }
  );

  // Validate session — this also refreshes expired tokens and triggers setAll
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Now build the ONE response with ALL accumulated cookies ──────────

  function buildResponse(base: NextResponse): NextResponse {
    cookiesToApply.forEach(({ name, value, options }) => {
      base.cookies.set(name, value, options);
    });
    return base;
  }

  function deleteStaleAndRedirectToLogin(): NextResponse {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const resp = NextResponse.redirect(url);
    // Nuke every sb-* cookie so the browser client doesn't retry stale tokens
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith("sb-")) {
        resp.cookies.set(name, "", { maxAge: 0, path: "/" });
      }
    });
    return resp;
  }

  // Let API routes through
  if (isApiRoute) {
    return buildResponse(NextResponse.next({ request }));
  }

  // Not authenticated + not on login → nuke cookies & redirect
  if (!user && !isLoginPage) {
    return deleteStaleAndRedirectToLogin();
  }

  // Not authenticated + on login with stale cookies → nuke them
  if (!user && isLoginPage) {
    const resp = NextResponse.next({ request });
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith("sb-")) {
        resp.cookies.set(name, "", { maxAge: 0, path: "/" });
      }
    });
    return resp;
  }

  // Authenticated + on login → redirect to dashboard with fresh cookies
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return buildResponse(NextResponse.redirect(url));
  }

  // Authenticated + normal page → pass through with ALL refreshed cookies
  return buildResponse(NextResponse.next({ request }));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
