import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();

  // Clear all Supabase auth cookies by redirecting to login
  const response = NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SUPABASE_URL ? "http://localhost:3000" : "http://localhost:3000"), {
    status: 302,
  });

  // Explicitly delete all possible Supabase auth cookies
  const cookieNames = [
    "sb-ohuddpwqnwdvyejwlumo-auth-token",
    "sb-ohuddpwqnwdvyejwlumo-auth-token.0",
    "sb-ohuddpwqnwdvyejwlumo-auth-token.1",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}

export async function GET(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", url.origin), {
    status: 302,
  });

  // Delete all cookies that start with sb-
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim().split("=")[0]);
  for (const name of cookies) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
