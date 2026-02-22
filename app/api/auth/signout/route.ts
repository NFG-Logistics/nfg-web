import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", url.origin), {
    status: 302,
  });

  // PART 5: Clear cookies properly
  // Delete all Supabase auth cookies
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim().split("=")[0]);
  for (const name of cookies) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/", httpOnly: false });
    }
  }

  // Also clear known Supabase cookie patterns
  const knownCookieNames = [
    "sb-ohuddpwqnwdvyejwlumo-auth-token",
    "sb-ohuddpwqnwdvyejwlumo-auth-token.0",
    "sb-ohuddpwqnwdvyejwlumo-auth-token.1",
  ];

  for (const name of knownCookieNames) {
    response.cookies.set(name, "", { maxAge: 0, path: "/", httpOnly: false });
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

  // PART 5: Clear cookies properly
  // Delete all cookies that start with sb-
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim().split("=")[0]);
  for (const name of cookies) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/", httpOnly: false });
    }
  }

  return response;
}
