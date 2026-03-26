/**
 * Resolve Supabase URL and anon/publishable key from env.
 * Supports legacy JWT anon key, new sb_publishable_* keys, and common Vercel var names.
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
    ""
  );
}

/**
 * Shared cookie options for Supabase SSR auth.
 * Keeping these explicit avoids production-only defaults drift across
 * runtimes/custom domains (local vs Vercel).
 */
export function getSupabaseCookieOptions() {
  const cookieDomain =
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim() ||
    process.env.AUTH_COOKIE_DOMAIN?.trim() ||
    undefined;

  // `secure` must be disabled during local http development or cookies won't
  // persist and auth will appear to "randomly logout" after refresh.
  const secure = process.env.NODE_ENV === "production";

  const base: Record<string, unknown> = {
    path: "/",
    sameSite: "lax" as const,
    secure,
  };

  if (cookieDomain) base.domain = cookieDomain;
  return base as any;
}
