"use client";

/**
 * Whisper Web — in-browser speech-to-text via @xenova/transformers.
 *
 * Model: Xenova/whisper-base.en (~74 MB, downloaded on first use, cached in
 * IndexedDB by transformers.js).
 *
 * Lifecycle:
 *   1. First call → downloads model (one-time, slow). Subsequent → instant load from cache.
 *   2. Returns a single `transcribe(audioBlob)` function that decodes WebM/Opus
 *      audio captured from MediaRecorder and returns plain text.
 *
 * Falls back gracefully if the model can't load (older browsers, low memory).
 */

let _pipeline: any | null = null;
let _loading: Promise<any> | null = null;

const MODEL = "Xenova/whisper-base.en";

export type LoadProgress = {
  status: "downloading" | "loading" | "ready";
  progress?: number;
  file?: string;
};

export async function loadWhisper(
  onProgress?: (p: LoadProgress) => void
): Promise<any> {
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;

  _loading = (async () => {
    // Configure transformers.js for the browser
    const tx = await import("@xenova/transformers");
    tx.env.allowLocalModels = false;
    tx.env.useBrowserCache = true;

    const pipeline = await tx.pipeline("automatic-speech-recognition", MODEL, {
      // @ts-expect-error transformers.js progress_callback typing varies by version
      progress_callback: (p: any) => {
        if (!onProgress) return;
        if (p.status === "progress") {
          onProgress({ status: "downloading", progress: p.progress, file: p.file });
        } else if (p.status === "done") {
          onProgress({ status: "loading" });
        } else if (p.status === "ready") {
          onProgress({ status: "ready" });
        }
      },
      // Smaller dtype for speed
      // @ts-expect-error
      quantized: true,
    });
    _pipeline = pipeline;
    onProgress?.({ status: "ready" });
    return pipeline;
  })();

  try {
    return await _loading;
  } finally {
    _loading = null;
  }
}

/**
 * Decode an audio Blob → mono float32 PCM at 16kHz (what Whisper expects).
 */
async function blobTo16kFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(arrayBuf);
  // Mix channels to mono if needed
  const channels = decoded.numberOfChannels;
  const length = decoded.length;
  const out = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

export async function transcribe(audioBlob: Blob): Promise<string> {
  const pipeline = await loadWhisper();
  const audio = await blobTo16kFloat32(audioBlob);
  const result = await pipeline(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    language: "english",
    task: "transcribe",
  });
  return (Array.isArray(result) ? result[0]?.text : result.text) || "";
}

/**
 * Helper: ask for mic permission once + return the stream.
 * Caller is responsible for stopping the tracks.
 */
export async function getMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 16000,
    },
  });
}

export function isWhisperSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof window.AudioContext !== "undefined"
  );
}
