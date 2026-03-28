"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const REMEMBER_EMAIL_KEY = "nfg_logistics_remembered_email";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // On mount: clear any stale auth state so the browser client doesn't
  // try to refresh an expired token in a loop, then load remembered email.
  // The middleware already redirects authenticated users to /dashboard,
  // so if we're here, the session is invalid or absent.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createClient();

    const init = async () => {
      // signOut({ scope: "local" }) clears client-side tokens/cookies
      // without hitting the Auth server, preventing refresh-retry loops.
      await supabase.auth.signOut({ scope: "local" });

      const remembered = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (remembered) {
        setEmail(remembered);
        setRememberMe(true);
      }
    };

    void init();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Store email if Remember Me is checked
    if (rememberMe && typeof window !== "undefined") {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    } else if (!rememberMe && typeof window !== "undefined") {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl bg-background/80 p-2 shadow-sm">
            <Image
              src="/company-logo.png"
              alt="NFG Logistics"
              width={280}
              height={83}
              priority
              className="h-auto w-auto max-w-[220px] sm:max-w-[260px]"
            />
          </div>
          <p className="text-sm text-muted-foreground">Trucking Management System</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@nfglogistics.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal cursor-pointer"
                >
                  Remember me
                </Label>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Contact your administrator for account access.
        </p>
      </div>
    </div>
  );
}
