"use client";

/**
 * Speech-to-text via the /api/stt server route (OpenAI transcription).
 * Server-side because in-browser transformers.js Whisper breaks under Turbopack.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, "speech.webm");
  const res = await fetch("/api/stt", { method: "POST", body: fd });
  if (!res.ok) {
    let detail = `stt ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) detail = j.error;
    } catch {}
    throw new Error(detail);
  }
  const { text } = (await res.json()) as { text?: string };
  return (text || "").trim();
}
