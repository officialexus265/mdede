import { Navigate, createFileRoute } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { SignInGate } from "@/lib/auth/gates";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <SignInGate fallback={<LoginForm />}>
      <Navigate to="/" />
    </SignInGate>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({ email, password, name: name || "Owner" });
        if (res.error) throw new Error(res.error.message || "Could not create account");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Could not sign in");
      }
      window.location.assign("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-6" />
          </span>
          <div>
            <p className="text-xs tracking-[0.22em] text-primary uppercase">Station</p>
            <h1 className="font-display text-3xl leading-none">M'dede Restaurant</h1>
          </div>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Paper pads stay on the floor. Sign in to open the desktop station.
        </p>

        <form className="grid gap-3" onSubmit={submit}>
          {mode === "up" ? (
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          ) : null}
          <Input
            type="email"
            required
            placeholder="owner@mdede.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            required
            minLength={8}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button size="lg" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "up" ? "Create owner account" : "Sign in with email"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "Need an owner account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
