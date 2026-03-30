import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function handleSignOut(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", url.origin), {
    status: 302,
  });

  // Delete all sb-* cookies to ensure the browser is fully clean
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
