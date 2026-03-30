"use client";

import { useUserContext } from "@/components/user-provider";

/**
 * Returns the current authenticated user.
 *
 * The user data originates from the server (dashboard layout fetches it
 * via the server Supabase client using middleware-refreshed cookies).
 * This eliminates the client-side getUser() call that previously caused
 * the "??" ghost mode on Vercel deployments — the browser Supabase
 * client's _recoverAndRefresh would sometimes fire SIGNED_OUT before
 * the Set-Cookie headers from the middleware were fully processed.
 */
export function useUser() {
  return useUserContext();
}
