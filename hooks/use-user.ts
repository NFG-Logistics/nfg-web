"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";

/**
 * Build a minimal fallback User from Supabase session metadata so the
 * dashboard never shows "??" even when the `public.users` row is missing
 * or temporarily unreachable.
 */
function fallbackUser(su: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): User {
  const meta = su.user_metadata ?? {};
  return {
    id: su.id,
    company_id: (meta.company_id as string) ?? "",
    role: ((meta.role as string) ?? "admin") as User["role"],
    full_name:
      (meta.full_name as string) ??
      su.email?.split("@")[0] ??
      "User",
    email: su.email ?? "",
    phone: (meta.phone as string) ?? undefined,
    avatar_url: (meta.avatar_url as string) ?? undefined,
    is_active: true,
    availability_status: "available",
    created_at: "",
    updated_at: "",
  };
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Prevent double-init in React StrictMode
  const initialised = useRef(false);

  const loadProfile = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }
    ) => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", sessionUser.id)
          .single();

        if (data && !error) {
          setUser(data);
        } else {
          // Profile row missing / RLS blocked → use session metadata
          console.warn(
            "Profile fetch failed, using session metadata:",
            error?.message
          );
          setUser(fallbackUser(sessionUser));
        }
      } catch {
        setUser(fallbackUser(sessionUser));
      }
    },
    []
  );

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const supabase = createClient();

    // --- initial load -------------------------------------------------------
    // getSession() reads from cookies/storage AND triggers a token refresh if
    // the access-token is expired.  Unlike getUser() it never returns an error
    // just because the JWT has expired – it refreshes first, then returns.
    async function init() {
      try {
        // Prefer getUser() on first paint: it validates the JWT with Supabase Auth.
        // getSession() reads only from storage; after a hard reload on Vercel, that
        // can briefly disagree with server/middleware unless cookies are in sync.
        const {
          data: { user: authUser },
          error,
        } = await supabase.auth.getUser();

        if (error || !authUser) {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();
          if (sessionError || !session) {
            setUser(null);
            return;
          }
          await loadProfile(supabase, session.user);
          return;
        }

        await loadProfile(supabase, authUser);
      } catch (err) {
        console.error("useUser init error:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    init();

    // --- listen for auth changes (refresh, sign-in, sign-out) ---------------
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        setLoading(false);
        return;
      }

      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, etc.
      await loadProfile(supabase, session.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  return { user, loading };
}
