"use client";

import { transcribe } from "./voice";

/**
 * Speech-to-text — 100% ON-DEVICE in the browser via @huggingface/transformers Whisper
 * (see ./voice). No OpenAI key, no server round-trip; the audio never leaves the browser.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  return (await transcribe(blob)).trim();
}
