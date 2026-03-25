import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseCookieOptions(),
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Avoid parsing non-existent OAuth/PKCE fragments on full reload — can clear
        // cookie session in production (see Supabase SSR + Next.js refresh issues).
        detectSessionInUrl: false,
      },
    }
  );
}
