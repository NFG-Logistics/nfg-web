import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  return createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Avoid parsing non-existent OAuth/PKCE fragments on full reload — can clear
      // cookie session in production (see Supabase SSR + Next.js refresh issues).
      detectSessionInUrl: false,
    },
  });
}
