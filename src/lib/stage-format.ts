"use client";

/**
 * Ask the server (gpt) to split a finished answer into a clean on-screen `display` string
 * and a TTS-optimised `voice` string. Always resolves — falls back to the raw text on any
 * failure so the stage never blocks.
 */
export async function formatForStage(text: string): Promise<{ display: string; voice: string }> {
  const fallback = { display: text, voice: text };
  if (!text?.trim()) return { display: "", voice: "" };
  try {
    const res = await fetch("/api/voice-format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { display?: string; voice?: string };
    const display = (j.display || "").trim() || text;
    const voice = (j.voice || "").trim() || display;
    return { display, voice };
  } catch {
    return fallback;
  }
}
