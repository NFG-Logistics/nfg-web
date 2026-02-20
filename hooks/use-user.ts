"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      // Use getUser() (server-validated) to avoid stale/phantom sessions.
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setUser(null);
        setLoading(false);
        return;
      }

      if (auth.user) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", auth.user.id)
          .single();
        setUser(data);
      } else {
        setUser(null);
      }
      setLoading(false);
    }

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // session may be null if refresh token expired or cookies are missing
      if (session?.user) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", session.user.id)
          .single();
        setUser(data);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
