"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP_BRAND } from "@/lib/branding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/vendor/applications");
    router.refresh();
    setLoading(false);
  }

  async function onCreateAccount() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/vendor/applications");
      router.refresh();
    } else {
      setMessage("Account created. If email confirmation is enabled in Supabase, confirm email before signing in.");
    }

    setLoading(false);
  }

  async function onDemoMode() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/auth/demo", {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to enter demo mode.");
      setLoading(false);
      return;
    }

    setMessage(`Demo mode active as ${payload.demoUser}.`);
    router.push("/vendor/applications");
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-white/88 shadow-[0_30px_65px_-48px_rgba(9,39,78,0.6)] lg:grid-cols-[1.1fr_1fr]">
        <div className="hero-panel border-r border-border/60 p-8">
          <p className="section-title">{APP_BRAND.shortName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{APP_BRAND.fullName}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {APP_BRAND.tagline}
          </p>

          <div className="mt-8 grid gap-3">
            <div className="metric-panel p-4">
              <p className="text-xs text-muted-foreground">Lane 1</p>
              <p className="mt-1 text-sm font-semibold">Submission</p>
              <p className="mt-1 text-xs text-muted-foreground">Collect files and UAE contact details, then submit for review.</p>
            </div>
            <div className="metric-panel p-4">
              <p className="text-xs text-muted-foreground">Lane 2</p>
              <p className="mt-1 text-sm font-semibold">Review & Decision</p>
              <p className="mt-1 text-xs text-muted-foreground">Run checks, inspect results, and approve or disapprove vendors.</p>
            </div>
          </div>
        </div>

        <Card className="m-4 border-0 bg-white/95 shadow-none">
          <CardHeader>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure Access
            </div>
            <CardTitle className="pt-2">Sign in</CardTitle>
            <CardDescription>Use email + password for quick access.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSignIn}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete="current-password"
                />
              </div>
              {message ? <p className="text-sm text-primary">{message}</p> : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="flex gap-2">
                <Button className="flex-1" type="submit" disabled={loading}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Please wait...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>
                <Button className="flex-1" type="button" variant="outline" disabled={loading} onClick={onCreateAccount}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Please wait...
                    </span>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </div>
              {demoEnabled ? (
                <Button className="w-full" type="button" variant="secondary" disabled={loading} onClick={onDemoMode}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Please wait...
                    </span>
                  ) : (
                    "Enter Demo Mode"
                  )}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
