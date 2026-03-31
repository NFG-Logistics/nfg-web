"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      (meta.full_name as string) ?? su.email?.split("@")[0] ?? "User",
    email: su.email ?? "",
    phone: (meta.phone as string) ?? undefined,
    avatar_url: (meta.avatar_url as string) ?? undefined,
    is_active: true,
    availability_status: "available",
    created_at: "",
    updated_at: "",
  };
}

function clearAuthCookies() {
  if (typeof document === "undefined") return;
  document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter((name) => name.startsWith("sb-"))
    .forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/;`;
    });
}

function sendToLogin() {
  clearAuthCookies();
  window.location.replace("/login");
}

// Race a promise against a timeout — prevents hanging forever if the
// Supabase client gets stuck trying to refresh an invalidated token.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Auth timeout")), ms)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initialised = useRef(false);

  const loadProfile = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      authUser: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      }
    ): Promise<User> => {
      try {
        const { data, error } = await withTimeout(
          supabase.from("users").select("*").eq("id", authUser.id).single(),
          8000
        );
        return data && !error ? (data as User) : fallbackUser(authUser);
      } catch {
        return fallbackUser(authUser);
      }
    },
    []
  );

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const supabase = createClient();

    async function init() {
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), 8000);

        if (!session) {
          sendToLogin();
          return;
        }

        const profile = await loadProfile(supabase, session.user);
        setUser(profile);
        setLoading(false);
      } catch {
        sendToLogin();
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const profile = await loadProfile(supabase, session.user);
        setUser(profile);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
