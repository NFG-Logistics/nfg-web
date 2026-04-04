import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "driver") {
    redirect("/driver-app");
  }

  // Pass server-validated user to client components via DashboardShell.
  return (
    <DashboardShell
      initialUser={{
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      }}
    >
      {children}
    </DashboardShell>
  );
}
