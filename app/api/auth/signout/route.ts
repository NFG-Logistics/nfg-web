import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function handleSignOut(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/login", origin), {
    status: 302,
  });

  // Nuke every sb-* cookie so the browser is fully clean after sign-out.
  // This prevents stale tokens from triggering refresh loops on the login page.
  const cookieHeader = request.headers.get("cookie") || "";
  cookieHeader
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter((name) => name.startsWith("sb-"))
    .forEach((name) => {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    });

  return response;
}

export async function GET(request: Request) {
  return handleSignOut(request);
}

export async function POST(request: Request) {
  return handleSignOut(request);
}
