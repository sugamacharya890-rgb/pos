"use client";

import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Sign-in failed");
    router.replace(next?.startsWith("/") ? next : json.redirectTo);
    router.refresh();
  }

  return (
    <form action={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-8 shadow-xl animate-arrive">
      <div className="mb-6">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">R</div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground">Restaurant Management System</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="username" className="h-14 w-full rounded-xl border bg-background px-4 text-lg outline-none focus:border-primary" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className="h-14 w-full rounded-xl border bg-background px-4 text-lg outline-none focus:border-primary" />
      </label>
      {error && <p className="rounded-xl bg-occupied/10 p-3 text-occupied" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        <LogIn /> {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
