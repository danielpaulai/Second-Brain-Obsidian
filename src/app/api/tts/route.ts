import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/tts  { text: string }  →  audio/mpeg
 *
 * Server-side proxy to ElevenLabs so the API key never reaches the browser.
 * Uses `eleven_multilingual_v2` — ElevenLabs' most STABLE, highest-quality model. We fetch
 * the whole clip before playing (no streaming), so the small extra latency is invisible and
 * we trade the flash model's occasional robotic artifacts for a dependable, clean voice.
 *
 * Env: ELEVENLABS_API_KEY (or the legacy `Elevel_Labs`), optional ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL.
 */

const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
// Default voice: "Charlie — Deep, Confident, Energetic" (premade). Override via ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = "IKne3meq5aSn9XLyUdCD";

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY || process.env.Elevel_Labs;
  if (!key) {
    return NextResponse.json(
      { error: "ElevenLabs key not set. Add ELEVENLABS_API_KEY (or Elevel_Labs) to .env.local." },
      { status: 500 }
    );
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });
  // Safety cap so a runaway answer can't burn the character quota.
  if (text.length > 2500) text = text.slice(0, 2500);

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        // Higher stability = consistent, no erratic "robotic" wobble; modest style for life.
        voice_settings: { stability: 0.62, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't reach ElevenLabs: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `ElevenLabs ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
  }

  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
