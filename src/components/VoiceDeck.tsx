"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Microphone, CircleNotch, SpeakerHigh } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getMicrophoneStream, isWhisperSupported } from "@/lib/voice";
import { transcribeAudio } from "@/lib/stt";
import { stopSpeaking } from "@/lib/tts";
import { useVoice } from "@/lib/voice-store";
import { cn } from "@/lib/utils";

/**
 * Push-to-talk voice control for the demo. Hold SPACE to record, release to transcribe
 * (local Whisper) and send to the AI; the answer is spoken back via ElevenLabs (handled
 * in ChatPanel). Renders a floating status HUD. Spacebar is ignored while typing.
 */
export default function VoiceDeck({ onSend }: { onSend: (text: string) => void }) {
  const phase = useVoice((s) => s.phase);
  const level = useVoice((s) => s.level);

  // Mutable recording state (kept out of React render path)
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  // Server STT (OpenAI) — nothing to download, ready immediately.
  useEffect(() => { useVoice.getState().setModelReady(true); }, []);

  useEffect(() => {
    function inEditable() {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (inEditable()) return; // let the chat box use space normally
      e.preventDefault();
      if (recordingRef.current) return;
      const p = useVoice.getState().phase;
      if (p === "transcribing" || p === "thinking") return; // busy
      startRecording();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (!recordingRef.current) return;
      e.preventDefault();
      stopRecording();
    }
    // If focus leaves the window mid-hold, finish the recording gracefully.
    function onBlur() { if (recordingRef.current) stopRecording(); }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      teardownStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSend]);

  function teardownStream() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    useVoice.getState().setLevel(0);
  }

  async function startRecording() {
    if (!isWhisperSupported()) {
      toast.error("Voice input isn't supported in this browser");
      return;
    }
    stopSpeaking(); // interrupt any answer that's currently playing
    const v = useVoice.getState();
    v.setTranscript("");

    let stream: MediaStream;
    try {
      stream = await getMicrophoneStream();
    } catch (err: any) {
      toast.error(err?.name === "NotAllowedError" ? "Microphone permission denied" : "Couldn't access microphone");
      return;
    }
    streamRef.current = stream;
    recordingRef.current = true;
    v.setPhase("recording");
    startRef.current = Date.now();

    // Mic level meter
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
        const rms = Math.sqrt(sum / buf.length);
        useVoice.getState().setLevel(Math.min(1, rms * 3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      teardownStream();
      const tooShort = Date.now() - startRef.current < 350 || blob.size < 1200;
      if (tooShort) { useVoice.getState().setPhase("idle"); return; }
      useVoice.getState().setPhase("transcribing");
      try {
        const text = (await transcribeAudio(blob)).trim();
        // Whisper emits "(silence)" / "[BLANK_AUDIO]" style noise for empty clips — drop those.
        const clean = text.replace(/^[\[(].*[\])]$/, "").trim();
        if (clean) {
          useVoice.getState().setTranscript(clean);
          useVoice.getState().setSpeakNext(true);
          useVoice.getState().setPhase("thinking");
          onSend(clean);
        } else {
          useVoice.getState().setPhase("idle");
          toast.info("Didn't catch that — hold Space and try again");
        }
      } catch (err) {
        console.error(err);
        toast.error("Transcription failed");
        useVoice.getState().setPhase("idle");
      }
    };
    recorder.start();
  }

  function stopRecording() {
    recordingRef.current = false;
    try { recorderRef.current?.stop(); } catch {}
  }

  const fade = {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
    transition: { duration: 0.15 },
  };

  return (
    <div className="pointer-events-none absolute bottom-10 left-1/2 z-[60] -translate-x-1/2">
      {/* Minimal, text-free pill. A small circle at rest; on Space it expands into a
          live waveform. Other states are single quiet glyphs. */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        onClick={() => {
          if (phase === "speaking") { stopSpeaking(); useVoice.getState().setPhase("idle"); }
        }}
        className={cn(
          "glass pointer-events-auto flex h-12 items-center justify-center rounded-full",
          phase === "recording" ? "gap-[3px] px-5" : "w-12",
          phase === "speaking" && "cursor-pointer"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {phase === "idle" && (
            <motion.span key="idle" {...fade}>
              <Microphone size={19} weight="duotone" className="text-zinc-300" />
            </motion.span>
          )}

          {phase === "recording" && (
            <motion.div key="rec" {...fade} className="flex h-5 items-center gap-[3px]">
              {Array.from({ length: 15 }).map((_, i) => {
                const center = Math.abs(i - 7) / 7; // 0 center → 1 edge
                const h = 3 + level * 18 * (1 - center * 0.55);
                return (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-cyan-200/85"
                    style={{ height: `${Math.max(3, h)}px`, transition: "height 80ms linear" }}
                  />
                );
              })}
            </motion.div>
          )}

          {phase === "transcribing" && (
            <motion.span key="trans" {...fade}>
              <CircleNotch size={18} className="animate-spin text-cyan-200/90" />
            </motion.span>
          )}

          {phase === "thinking" && (
            <motion.span key="think" {...fade} className="relative flex h-2.5 w-2.5">
              {/* CSS pulse (not a framer infinite animation — those lock AnimatePresence mode="wait"). */}
              <span className="absolute inset-0 animate-ping rounded-full bg-cyan-300/60" />
              <span className="relative block h-2.5 w-2.5 rounded-full bg-cyan-200" />
            </motion.span>
          )}

          {phase === "speaking" && (
            <motion.span key="speak" {...fade}>
              <SpeakerHigh size={19} weight="duotone" className="text-cyan-100" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
