"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { User } from "@/types";

interface UserContextValue {
  user: User | null;
  loading: boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
});

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

/**
 * Provides the authenticated user to all client components.
 *
 * Accepts an optional `initialUser` from the server layout so the first
 * render already has user data (no loading flash). Then subscribes to
 * Supabase auth state changes so sign-out / token-refresh still works.
 */
export function UserProvider({
  initialUser,
  children,
}: {
  /** Supabase auth user from the server (getUser().data.user) */
  initialUser?: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
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

    async function init() {
      try {
        // If NEXT_PUBLIC Supabase env vars were not present at build time on Vercel,
        // createClient() can throw and the app will appear to "load forever".
        const url = getSupabaseUrl();
        const key = getSupabaseAnonKey();
        if (!url || !key) {
          console.error(
            "Supabase client env missing in browser bundle. Ensure Vercel Production env includes NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy."
          );
          setUser(null);
          return;
        }

        const supabase = createClient();

        if (initialUser) {
          // Server already validated the user — skip the getUser() round-trip
          await loadProfile(supabase, initialUser);
        } else {
          // Fallback: no server seed (e.g. client-only navigation).
          // Use getSession() to avoid transient false-negatives in production refreshes.
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.user) {
            setUser(null);
            setLoading(false);
            return;
          }

          await loadProfile(supabase, session.user);
        }
      } catch (err) {
        console.error("UserProvider init error:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    init();

    // If the server already validated a user for this request, don't let the
    // browser-side auth listener clobber it on refresh. In production, the
    // browser client may not be able to read cookie-based sessions (httpOnly),
    // which would emit a null/SIGNED_OUT session even though the server is valid.
    if (initialUser) {
      return () => {};
    }

    // Listen for auth changes (sign-out, token refresh, etc.)
    let unsubscribe = () => {};
    try {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        // In some production setups, Supabase can emit INITIAL_SESSION with a null session
        // even though the server still has a valid cookie-based session. Don't clobber a
        // server-seeded user in that case.
        if (event === "INITIAL_SESSION" && !session) {
          setLoading(false);
          return;
        }

        if (event === "SIGNED_OUT" || !session) {
          setUser(null);
          setLoading(false);
          return;
        }

        await loadProfile(supabase, session.user);
        setLoading(false);
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch (err) {
      console.error("Supabase client init failed:", err);
      setLoading(false);
    }

    return () => unsubscribe();
  }, [initialUser, loadProfile]);

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
