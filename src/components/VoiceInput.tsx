"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Microphone, Stop, Spinner, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  loadWhisper,
  transcribe,
  getMicrophoneStream,
  isWhisperSupported,
  type LoadProgress,
} from "@/lib/voice";
import { cn } from "@/lib/utils";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** Inline (next to input) or floating */
  variant?: "inline" | "floating";
};

type State = "idle" | "loading-model" | "recording" | "transcribing";

export default function VoiceInput({ onTranscript, disabled, variant = "inline" }: Props) {
  const [state, setState] = useState<State>("idle");
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(isWhisperSupported());
  }, []);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    try {
      recorderRef.current?.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
  }

  async function start() {
    if (disabled) return;
    if (!supported) {
      toast.error("Voice input not supported in this browser");
      return;
    }
    // 1. Preload the model (cached after first time) — fast on subsequent calls
    setState("loading-model");
    setLoadPct(0);
    try {
      await loadWhisper((p: LoadProgress) => {
        if (p.status === "downloading" && typeof p.progress === "number") {
          setLoadPct(Math.round(p.progress));
        }
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't load voice model. Try refreshing.");
      setState("idle");
      return;
    }
    setLoadPct(null);

    // 2. Get mic
    let stream: MediaStream;
    try {
      stream = await getMicrophoneStream();
    } catch (err: any) {
      toast.error(
        err?.name === "NotAllowedError"
          ? "Microphone permission denied"
          : "Couldn't access microphone"
      );
      setState("idle");
      return;
    }
    streamRef.current = stream;

    // 3. Start recording
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (tickRef.current) clearInterval(tickRef.current);
      if (blob.size < 1000) {
        setState("idle");
        return;
      }
      setState("transcribing");
      try {
        const text = await transcribe(blob);
        if (text?.trim()) {
          onTranscript(text.trim());
        } else {
          toast.info("Nothing heard");
        }
      } catch (err) {
        console.error(err);
        toast.error("Transcription failed");
      } finally {
        setState("idle");
        setElapsed(0);
      }
    };
    recorder.start();
    setState("recording");
    startTimeRef.current = Date.now();
    setElapsed(0);
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 200);
  }

  function stop() {
    try {
      recorderRef.current?.stop();
    } catch {}
  }

  function cancel() {
    try {
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.stop();
      }
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    setState("idle");
    setElapsed(0);
  }

  const isBusy = state !== "idle";

  return (
    <div className={cn("flex items-center gap-2", variant === "floating" && "absolute right-3 bottom-3")}>
      <AnimatePresence mode="wait" initial={false}>
        {state === "recording" && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 text-rose-300 text-xs font-mono"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span className="tabular-nums">
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
              {String(elapsed % 60).padStart(2, "0")}
            </span>
            <button
              onClick={cancel}
              title="Cancel"
              className="ml-1 opacity-70 hover:opacity-100"
            >
              <X size={12} weight="bold" />
            </button>
          </motion.div>
        )}
        {state === "loading-model" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-accent-400/30 bg-accent-500/10 text-accent-300 text-xs"
          >
            <Spinner size={12} className="animate-spin" />
            <span>
              {loadPct !== null && loadPct > 0
                ? `Loading model… ${loadPct}%`
                : "Loading model…"}
            </span>
          </motion.div>
        )}
        {state === "transcribing" && (
          <motion.div
            key="transcribing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-accent-400/30 bg-accent-500/10 text-accent-300 text-xs"
          >
            <Spinner size={12} className="animate-spin" />
            <span>Transcribing…</span>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={state === "idle" ? start : state === "recording" ? stop : undefined}
        disabled={disabled || (state !== "idle" && state !== "recording")}
        title={
          !supported
            ? "Voice input not supported"
            : state === "recording"
              ? "Stop recording"
              : "Start voice input"
        }
        className={cn(
          "shrink-0 grid place-items-center h-10 w-10 rounded-lg border transition",
          state === "recording"
            ? "border-rose-400/50 bg-rose-500/20 text-rose-300 shadow-[0_0_22px_-6px_rgba(244,63,94,0.7)]"
            : isBusy
              ? "border-border bg-card/40 text-muted-foreground"
              : "border-border bg-card/60 hover:bg-card hover:border-accent-400/40 text-muted-foreground hover:text-accent-300",
          (disabled || !supported) && "opacity-40 cursor-not-allowed"
        )}
      >
        {state === "recording" ? (
          <Stop size={16} weight="fill" />
        ) : (
          <Microphone size={16} weight="duotone" />
        )}
      </button>
    </div>
  );
}
