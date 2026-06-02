"use client";

import { create } from "zustand";

/**
 * Voice-demo coordination. The spacebar push-to-talk deck (VoiceDeck) drives
 * recording/transcribing; ChatPanel drives thinking/speaking once a voice-initiated
 * message lands. `speakNext` marks the next answer to be spoken (so typed messages
 * stay silent).
 */

export type VoicePhase = "idle" | "recording" | "transcribing" | "thinking" | "speaking";

type VoiceState = {
  phase: VoicePhase;
  /** Live transcript preview while/after recording. */
  transcript: string;
  /** Mic input level 0..1 while recording (drives the meter). */
  level: number;
  /** Whether the model is downloaded/ready (first use downloads ~74MB). */
  modelReady: boolean;
  /** The next assistant answer should be spoken (set when a voice query is sent). */
  speakNext: boolean;
  setPhase: (p: VoicePhase) => void;
  setTranscript: (t: string) => void;
  setLevel: (n: number) => void;
  setModelReady: (v: boolean) => void;
  setSpeakNext: (v: boolean) => void;
};

export const useVoice = create<VoiceState>((set) => ({
  phase: "idle",
  transcript: "",
  level: 0,
  modelReady: false,
  speakNext: false,
  setPhase: (p) => set({ phase: p }),
  setTranscript: (t) => set({ transcript: t }),
  setLevel: (n) => set({ level: n }),
  setModelReady: (v) => set({ modelReady: v }),
  setSpeakNext: (v) => set({ speakNext: v }),
}));

// Dev-only debug handle (drive the voice HUD from the console, e.g. for visual testing:
// `__voice.getState().setPhase("recording")`). Never attached in production.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __voice?: typeof useVoice }).__voice = useVoice;
}
