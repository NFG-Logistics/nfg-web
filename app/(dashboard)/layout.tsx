import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  // PART 4: Fetch profile inside server component
  // If profile fails → signOut + redirect('/login')
  // Do NOT render dashboard until profile exists
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If no user session → redirect to login
  if (!user || authError) {
    redirect("/login");
  }

  // Fetch profile to ensure it exists
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, company_id, full_name, email")
    .eq("id", user.id)
    .single();

  // If profile missing or error → sign out and redirect to login
  // This prevents rendering dummy/empty dashboard
  if (!profile || profileError) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  // Only render dashboard if both user and profile exist
  return <DashboardShell>{children}</DashboardShell>;
}
