"use client";

/**
 * Speech-to-text via the server-side OpenAI Whisper proxy (POST /api/stt). The recorded audio is
 * sent as multipart form-data and the OpenAI key never leaves the server. (The previous on-device
 * @huggingface/transformers Whisper still lives in ./voice but is no longer used for transcription.)
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "speech.webm");

  const res = await fetch("/api/stt", { method: "POST", body: form });
  if (!res.ok) {
    let msg = `Transcription failed (${res.status})`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}
