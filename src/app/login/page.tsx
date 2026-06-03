"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { EnvelopeSimple, Brain, ArrowRight, CheckCircle, GoogleLogo } from "@phosphor-icons/react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = isSupabaseConfigured() ? createClient() : null;

  // If already signed in, bounce to home
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router, supabase]);

  // Complete an implicit-flow sign-in: a magic link that returns the session in the URL hash
  // (#access_token=…&refresh_token=…) instead of a PKCE ?code. setSession writes the SSR cookies,
  // then we bounce home. (The normal emailed link uses PKCE; this covers admin-generated links.)
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

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase not configured");
      return;
    }
    setSending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
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
          Sign in to AI Danny
        </h1>
        <p className="text-center text-sm text-muted-foreground mt-1">
          Magic link · no password
        </p>

        {sent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center"
          >
            <CheckCircle size={28} weight="duotone" className="text-emerald-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-foreground">Check your email</div>
            <div className="text-xs text-muted-foreground mt-1">
              We sent a sign-in link to{" "}
              <span className="text-foreground">{email}</span>
            </div>
            <button
              onClick={() => setSent(false)}
              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Wrong email?
            </button>
          </motion.div>
        ) : (
          <>
            <form onSubmit={signInWithEmail} className="mt-8 space-y-3">
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
              <button
                type="submit"
                disabled={!email || sending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:bg-ink-700 disabled:text-zinc-600 text-white py-3 text-sm font-medium transition shadow-[0_0_24px_-6px_rgba(167,139,250,0.7)]"
              >
                {sending ? "Sending…" : "Send magic link"}
                {!sending && <ArrowRight size={14} weight="bold" />}
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
