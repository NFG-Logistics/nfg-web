"use client";

import { useAuth } from "@/components/auth-provider";

/**
 * Returns the authenticated user and loading state.
 *
 * All auth validation happens client-side via the AuthProvider.
 * The browser Supabase client manages tokens by writing directly
 * to document.cookie — no dependency on server-side Set-Cookie headers.
 */
export function useUser() {
  return useAuth();
}
