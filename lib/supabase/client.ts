import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Keep sessions stable across refresh/idle by persisting + auto-refreshing tokens.
      auth: { persistSession: true, autoRefreshToken: true },
    }
  );
}
