import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // 7-day session persistence: persist session and auto-refresh tokens
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Session will persist for 7 days (configured in Supabase dashboard)
        // JWT expiry is set in backend Supabase project settings
      },
    }
  );
}
