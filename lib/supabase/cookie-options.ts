/**
 * Shared cookie options for all Supabase SSR clients (middleware, server, browser).
 * `secure` must be true in production (HTTPS) so cookies behave consistently on Vercel;
 * local dev is usually HTTP so secure stays false.
 */
export function getSupabaseCookieOptions() {
  return {
    path: "/" as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
