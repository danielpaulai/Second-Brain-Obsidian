"use client";

import { useEffect, useState } from "react";
import { Lock, ArrowRight } from "@phosphor-icons/react";
import { motion } from "motion/react";

const STORAGE_KEY = "ai-danny-team-unlock";

/**
 * Lightweight client-side gate for the /ask route.
 *
 * Compares the entered password against NEXT_PUBLIC_TEAM_PASSWORD if set.
 * If the env var is empty, no gate is shown — the page is open.
 *
 * This is not a security boundary against a determined attacker (the password
 * lives in the client bundle), but it's enough to keep the team URL from
 * being usable by anyone who stumbles across it.
 */
export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const required = process.env.NEXT_PUBLIC_TEAM_PASSWORD || "";
  const [unlocked, setUnlocked] = useState(!required);
  const [entered, setEntered] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!required) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === required) setUnlocked(true);
  }, [required]);

  if (unlocked) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entered.trim() === required) {
      try {
        localStorage.setItem(STORAGE_KEY, required);
      } catch {}
      setUnlocked(true);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  };

  return (
    <main className="relative h-screen w-screen grid place-items-center bg-background text-foreground overflow-hidden">
      <motion.div
        animate={shake ? { x: [-6, 6, -4, 4, 0] } : undefined}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm mx-auto rounded-2xl border border-border bg-card/70 backdrop-blur-xl p-8 shadow-2xl shadow-black/60"
      >
        <div className="grid place-items-center w-12 h-12 rounded-xl mx-auto bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30">
          <Lock size={22} weight="duotone" className="text-accent-300" />
        </div>
        <h2 className="mt-5 text-center font-semibold tracking-tight text-lg">
          Ask Danny — team access
        </h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Enter the team password to continue.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-2">
          <input
            type="password"
            value={entered}
            onChange={(e) => setEntered(e.target.value)}
            autoFocus
            placeholder="Team password"
            className="w-full rounded-lg border border-border bg-background/80 outline-none focus:border-accent-400/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-accent-500 hover:bg-accent-400 text-white px-3 py-2.5 text-sm font-medium transition flex items-center justify-center gap-1.5"
          >
            Unlock
            <ArrowRight size={14} weight="bold" />
          </button>
        </form>
      </motion.div>
    </main>
  );
}
