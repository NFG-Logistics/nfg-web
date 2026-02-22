import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If NOT logged in → redirect('/login')
  // If logged in → redirect('/dashboard')
  // Never render dashboard directly at root
  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
