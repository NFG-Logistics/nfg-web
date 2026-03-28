import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseSessionCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .map(({ name }) => name)
    .filter((name) => /^sb-.+-auth-token/.test(name));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isApiRoute = path.startsWith("/api/");

  const sessionCookieNames = getSupabaseSessionCookieNames(request);
  const hasCookies = sessionCookieNames.length > 0;

  // No cookies + login page → nothing to validate, let it through immediately.
  if (isLoginPage && !hasCookies) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
    "";

  if (!supabaseUrl || !supabaseKey) {
    return new NextResponse("Supabase env vars missing", { status: 503 });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isApiRoute) return supabaseResponse;

  // Helper: copy refreshed cookies from supabaseResponse onto a redirect.
  function redirectTo(destination: string) {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    const resp = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      resp.cookies.set(c.name, c.value, c);
    });
    return resp;
  }

  // Helper: delete every sb-*-auth-token cookie so the browser client
  // never finds stale tokens and enters a refresh-retry loop.
  function clearSessionCookies(resp: NextResponse) {
    for (const name of sessionCookieNames) {
      resp.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
    return resp;
  }

  if (!user && !isLoginPage) {
    return clearSessionCookies(redirectTo("/login"));
  }

  // Stale cookies exist but the session is dead — nuke them so the browser
  // client on /login doesn't try to refresh_token in a loop.
  if (!user && isLoginPage && hasCookies) {
    return clearSessionCookies(NextResponse.next({ request }));
  }

  if (user && isLoginPage) {
    return redirectTo("/dashboard");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
