"use client";

import { useEffect, useRef } from "react";
import { usePresentation } from "@/lib/presentation-store";
import { useVoice } from "@/lib/voice-store";
import { prepareSpeech } from "@/lib/tts";
import { formatForStage } from "@/lib/stage-format";

/**
 * Stage read-through driver. While a question is being answered, this paces the demo:
 * every beat it reveals ONE queued note — lighting its node on the left and showing its
 * card on the right — and once every retrieved node has been read AND the model's text is
 * ready, it pre-generates the voice, then reveals the answer text + plays the audio TOGETHER
 * (the cards/"thinking" stay up until the voice is ready, so text never appears voiceless).
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
        void revealWhenVoiceReady(s.pendingAnswer);
      }
      // else: still waiting on the model — hold (cards stay up).
    }, READ_MS);
    return () => clearInterval(tick);
  }, [active]);

  return null;
}

/**
 * Split the answer into a clean on-screen `display` + a TTS-optimised `voice` (gpt → JSON),
 * pre-fetch the voice (keeping "thinking" up), then reveal the display text + start the audio
 * together — so text + voice land in the same beat, and the screen text is clean while the
 * spoken version is voice-optimised.
 */
export async function revealWhenVoiceReady(text: string) {
  useVoice.getState().setPhase("thinking");
  const { display, voice } = await formatForStage(text);
  const play = await prepareSpeech(voice); // resolves only once the clip is generated
  usePresentation.getState().revealAnswer(display); // reveal the clean display text…
  if (play) {
    useVoice.getState().setPhase("speaking");
    play(() => useVoice.getState().setPhase("idle")); // …and start the audio in the same beat
  } else {
    useVoice.getState().setPhase("idle");
  }
}
