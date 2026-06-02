import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/stt   multipart form { audio: Blob }   →   { text: string }
 *
 * Server-side speech-to-text via OpenAI's transcription API. Fast (~1-2s) and reliable.
 *
 * Why server-side: `@xenova/transformers` (in-browser Whisper) fails to initialize under
 * Next's Turbopack dev bundler (env.js Object.keys crash), so the local path is unusable
 * here. This keeps the voice demo working. Override the model with STT_MODEL (default
 * `whisper-1`, universally available; `gpt-4o-mini-transcribe` is faster/better if enabled).
 */
export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  let file: Blob | null = null;
  try {
    const inForm = await req.formData();
    const f = inForm.get("audio");
    if (f instanceof Blob) file = f;
  } catch {
    return NextResponse.json({ error: "invalid form" }, { status: 400 });
  }
  if (!file || file.size < 800) {
    return NextResponse.json({ text: "" });
  }

  const form = new FormData();
  form.append("file", file, "speech.webm");
  form.append("model", process.env.STT_MODEL || "whisper-1");
  form.append("language", "en");
  form.append("response_format", "json");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't reach OpenAI: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `OpenAI STT ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: (data.text || "").trim() });
}
