import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { NextResponse, type NextRequest } from "next/server";

function missingEnvResponse() {
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Configuration required</title></head>
<body style="font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">Supabase environment variables are missing</h1>
<p>Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and a client key (<code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> or
<code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>) in Vercel → Environment Variables, then redeploy.</p>
</body></html>`,
    {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    }
  );
}

/**
 * Resolve the signed-in user for routing. getUser() validates the JWT with Auth.
 * If it returns no user (e.g. transient Edge/network issues), fall back to getSession()
 * so a hard refresh does not false-negative to /login when cookies are still valid.
 * Dashboard layout still calls getUser() on the server for a real check.
 */
async function getAuthUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user: fromUser },
  } = await supabase.auth.getUser();

  if (fromUser) return fromUser;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    return missingEnvResponse();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const user = await getAuthUser(supabase);

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isApiRoute = path.startsWith("/api/");

  if (isApiRoute) return supabaseResponse;

  function redirectWithCookies(destination: string) {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    const redirectResponse = NextResponse.redirect(url);

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      const { name, value, ...opts } = cookie;
      redirectResponse.cookies.set(name, value, opts);
    });

    return redirectResponse;
  }

  if (!user && !isLoginPage) {
    return redirectWithCookies("/login");
  }

  if (user && isLoginPage) {
    return redirectWithCookies("/dashboard");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
