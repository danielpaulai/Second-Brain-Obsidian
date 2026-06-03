"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  Brain,
  CheckCircle,
  EnvelopeSimple,
  GoogleLogo,
  LockKey,
} from "@phosphor-icons/react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = isSupabaseConfigured() ? createClient() : null;

  // If already signed in, bounce to home
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router, supabase]);

  // Complete an implicit-flow sign-in from OAuth providers that return tokens in the URL hash.
  useEffect(() => {
    if (!supabase || typeof window === "undefined") return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) return;
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      window.history.replaceState(null, "", "/login");
      router.replace("/");
    });
  }, [supabase, router]);

  async function submitEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase not configured");
      return;
    }
    setSubmitting(true);
    setError(null);

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.replace("/");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.replace("/");
      return;
    }
    setCreated(true);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (!supabase) {
    return (
      <main className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2">Supabase not configured</h1>
          <p className="text-sm text-muted-foreground">
            Set <code className="text-accent-300">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-accent-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="text-accent-300">.env.local</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="grid place-items-center w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 shadow-[0_0_40px_-8px_rgba(167,139,250,0.6)]">
          <Brain size={26} weight="duotone" className="text-accent-300" />
        </div>

        <h1 className="text-center mt-6 text-2xl font-semibold tracking-tight">
          {mode === "sign-in" ? "Sign in to AI Danny" : "Create your AI Danny account"}
        </h1>
        <p className="text-center text-sm text-muted-foreground mt-1">
          Email and password access
        </p>

        {created ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center"
          >
            <CheckCircle size={28} weight="duotone" className="text-emerald-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-foreground">Account created</div>
            <div className="text-xs text-muted-foreground mt-1">
              If email confirmation is enabled, confirm{" "}
              <span className="text-foreground">{email}</span> before signing in.
            </div>
            <button
              onClick={() => {
                setCreated(false);
                setMode("sign-in");
              }}
              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Go to sign in
            </button>
          </motion.div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 rounded-lg border border-border bg-card/40 p-1 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("sign-in");
                  setError(null);
                }}
                className={`rounded-md py-2 transition ${
                  mode === "sign-in"
                    ? "bg-accent-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("sign-up");
                  setError(null);
                }}
                className={`rounded-md py-2 transition ${
                  mode === "sign-up"
                    ? "bg-accent-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={submitEmailPassword} className="mt-4 space-y-3">
              <div className="relative">
                <EnvelopeSimple
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-border bg-card/60 pl-10 pr-3 py-3 text-sm outline-none focus:border-accent-400/50 placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="relative">
                <LockKey
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-lg border border-border bg-card/60 pl-10 pr-3 py-3 text-sm outline-none focus:border-accent-400/50 placeholder:text-muted-foreground/60"
                />
              </div>
              <button
                type="submit"
                disabled={!email || !password || submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:bg-ink-700 disabled:text-zinc-600 text-white py-3 text-sm font-medium transition shadow-[0_0_24px_-6px_rgba(167,139,250,0.7)]"
              >
                {submitting
                  ? mode === "sign-in"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "sign-in"
                    ? "Sign in"
                    : "Sign up"}
                {!submitting && <ArrowRight size={14} weight="bold" />}
              </button>
            </form>

            <div className="my-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              <div className="flex-1 h-px bg-border" />
              <span>or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-card/40 hover:bg-card hover:border-accent-400/30 py-3 text-sm font-medium transition"
            >
              <GoogleLogo size={16} weight="duotone" />
              Continue with Google
            </button>

            {error && (
              <div className="mt-4 text-xs text-rose-400 text-center">{error}</div>
            )}
          </>
        )}

        <p className="mt-8 text-[10px] text-muted-foreground/60 text-center">
          Only emails on the team list get team-tier access. Owner email gets full access.
        </p>
      </motion.div>
    </main>
  );
}
