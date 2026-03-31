import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  const cookieStore = await cookies();

  const supabase = createClient();

  const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] =
    await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

  return NextResponse.json(
    {
      env: {
        hasSupabaseUrl: Boolean(getSupabaseUrl()),
        hasSupabaseAnonKey: Boolean(getSupabaseAnonKey()),
        supabaseUrlPrefix: getSupabaseUrl() ? `${getSupabaseUrl().slice(0, 28)}...` : "",
        supabaseKeyPrefix: getSupabaseAnonKey()
          ? `${getSupabaseAnonKey().slice(0, 16)}...`
          : "",
      },
      request: {
        host: h.get("host"),
        xForwardedProto: h.get("x-forwarded-proto"),
        userAgent: h.get("user-agent"),
        cookieHeaderPresent: Boolean(h.get("cookie")),
      },
      cookies: {
        count: cookieStore.getAll().length,
        names: cookieStore.getAll().map((c) => c.name),
        supabaseCookieNames: cookieStore
          .getAll()
          .map((c) => c.name)
          .filter((name) => name.startsWith("sb-")),
      },
      supabaseAuth: {
        getUser: {
          userId: userData.user?.id ?? null,
          email: userData.user?.email ?? null,
          error: userError
            ? { name: userError.name, status: userError.status, message: userError.message }
            : null,
        },
        getSession: {
          hasSession: Boolean(sessionData.session),
          sessionUserId: sessionData.session?.user?.id ?? null,
          error: sessionError
            ? {
                name: sessionError.name,
                status: sessionError.status,
                message: sessionError.message,
              }
            : null,
        },
      },
    },
    { status: 200 }
  );
}

