import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { UserProvider } from "@/components/user-provider";
import type { User } from "@/types";

export const dynamic = "force-dynamic";

function fallbackUser(authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): User {
  const meta = authUser.user_metadata ?? {};
  return {
    id: authUser.id,
    company_id: (meta.company_id as string) ?? "",
    role: ((meta.role as string) ?? "admin") as User["role"],
    full_name:
      (meta.full_name as string) ?? authUser.email?.split("@")[0] ?? "User",
    email: authUser.email ?? "",
    phone: (meta.phone as string) ?? undefined,
    avatar_url: (meta.avatar_url as string) ?? undefined,
    is_active: true,
    availability_status: "available",
    created_at: "",
    updated_at: "",
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  // Fetch profile from the users table — this gives us role, name, etc.
  let profile: User | null = null;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    profile = data && !error ? data : fallbackUser(authUser);
  } catch {
    profile = fallbackUser(authUser);
  }

  return (
    <UserProvider initialUser={profile}>
      <DashboardShell>{children}</DashboardShell>
    </UserProvider>
  );
}
