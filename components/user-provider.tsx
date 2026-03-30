"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";

interface UserContextValue {
  user: User | null;
  loading: boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
});

export function useUserContext() {
  return useContext(UserContext);
}

/**
 * Provides the authenticated user to all client components in the dashboard.
 *
 * The `initialUser` prop comes from the server (layout.tsx fetches it via
 * the server Supabase client, which reads the middleware-refreshed cookies).
 * This is the **single source of truth** — we never call getUser() on the
 * client during a page load, which eliminates the race-condition where
 * the browser client's _recoverAndRefresh fires SIGNED_OUT before cookies
 * are fully written, causing the "??" ghost mode on Vercel.
 *
 * We still listen to onAuthStateChange so that:
 *  - SIGNED_IN after a fresh login updates the user
 *  - USER_UPDATED reflects profile changes
 *  - SIGNED_OUT clears the user (only honoured after initial hydration)
 */
export function UserProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading] = useState(false);
  const didHydrate = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // Mark hydration complete after a brief tick so we can differentiate
    // a real SIGNED_OUT (user clicked sign-out) from the false-positive
    // SIGNED_OUT that @supabase/ssr fires during _recoverAndRefresh.
    const timer = setTimeout(() => {
      didHydrate.current = true;
    }, 3000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT" || !session) {
        if (didHydrate.current) {
          setUser(null);
        }
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        try {
          const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (data) setUser(data);
        } catch {
          // keep current user
        }
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
}
