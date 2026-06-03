"use client";

/**
 * Whisper Web — 100% in-browser, on-device speech-to-text via @huggingface/transformers (v4).
 * The audio NEVER leaves the browser (no API key, no server round-trip).
 *
 * Model: onnx-community/whisper-base.en — downloaded once on first use, cached by the browser.
 * Runs on WebGPU when available (fast, Chrome), else WASM (works everywhere, slower).
 *
 * The library is DYNAMICALLY imported inside loadWhisper() — a browser-only path triggered by a
 * user gesture — so it never evaluates during SSR / the Turbopack build (which is what made the
 * old @xenova/transformers crash on module-eval).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _loading: Promise<any> | null = null;

const MODEL = "onnx-community/whisper-base.en";

export type LoadProgress = {
  status: "downloading" | "loading" | "ready";
  progress?: number;
  file?: string;
};

function pickDevice(): "webgpu" | "wasm" {
  return typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadWhisper(onProgress?: (p: LoadProgress) => void): Promise<any> {
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;

  _loading = (async () => {
    const tx = await import("@huggingface/transformers");
    tx.env.allowLocalModels = false;

    const device = pickDevice();
    const pipe = await tx.pipeline("automatic-speech-recognition", MODEL, {
      device,
      // q8 keeps the download small + runs on both WebGPU and WASM.
      dtype: "q8",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (p: any) => {
        if (!onProgress) return;
        if (p.status === "progress") onProgress({ status: "downloading", progress: p.progress, file: p.file });
        else if (p.status === "done") onProgress({ status: "loading" });
        else if (p.status === "ready") onProgress({ status: "ready" });
      },
    });
    _pipeline = pipe;
    onProgress?.({ status: "ready" });
    return pipe;
  })();

  try {
    return await _loading;
  } finally {
    _loading = null;
  }
}

/** Decode an audio Blob → mono float32 PCM at 16kHz (what Whisper expects). */
async function blobTo16kFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(arrayBuf);
  const channels = decoded.numberOfChannels;
  const length = decoded.length;
  const out = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  await ctx.close().catch(() => {});
  return out;
}

export async function transcribe(audioBlob: Blob): Promise<string> {
  const pipeline = await loadWhisper();
  const audio = await blobTo16kFloat32(audioBlob);
  // NOTE: whisper-*.en is English-only — passing `language`/`task` throws. (Switch to a multilingual
  // model like onnx-community/whisper-base + those options if non-English is ever needed.)
  const result = await pipeline(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });
  const text = (Array.isArray(result) ? result[0]?.text : result?.text) || "";
  return text.trim();
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

// Dev-only console hooks so the on-device pipeline can be exercised without a mic:
//   await window.__whisperWarm()      → downloads + initialises the model
//   await window.__whisperSelfTest()  → runs the pipeline on 1s of silence (proves it executes)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__whisperWarm = (cb?: (p: LoadProgress) => void) => loadWhisper(cb);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__whisperSelfTest = async () => {
    const pipe = await loadWhisper();
    const r = await pipe(new Float32Array(16000));
    return Array.isArray(r) ? r[0]?.text : r?.text;
  };
}
