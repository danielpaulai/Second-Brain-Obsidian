"use client";

import { useEffect, useRef } from "react";
import { usePresentation } from "@/lib/presentation-store";
import { useVoice } from "@/lib/voice-store";

/**
 * Stage read-through driver. While a question is being answered, this paces the demo:
 * every beat it reveals ONE queued note — lighting its node on the left and showing its
 * card on the right — and once every retrieved node has been read AND the model's text is
 * ready, it reveals the answer (raw markdown, rendered structured by StageAnswer). No TTS:
 * only the opening greeting speaks; every answer is silent + on-screen.
 */
const READ_MS = 720; // per-node cadence — deliberate, readable

export default function StageReadthrough() {
  // Not during the LinkedIn theater — that flow runs its own timeline + reveal.
  const active = usePresentation((s) => s.mode === "stage" && s.querying && !s.linkedinActive);
  const revealing = useRef(false);

  useEffect(() => {
    if (!active) return;
    revealing.current = false;
    const tick = setInterval(() => {
      const s = usePresentation.getState();
      if (s.readQueue.length > 0) {
        s.revealNextRead(); // light the next node + show its card
        return;
      }
      if (s.pendingAnswer != null && !revealing.current) {
        revealing.current = true;
        clearInterval(tick);
        // No TTS: reveal the raw markdown answer; StageAnswer renders it (structured or plain).
        usePresentation.getState().revealAnswer(s.pendingAnswer);
        useVoice.getState().setPhase("idle");
      }
      // else: still waiting on the model — hold (cards stay up).
    }, READ_MS);
    return () => clearInterval(tick);
  }, [active]);

  return null;
}
