#!/usr/bin/env node
/**
 * Regenerate the pre-recorded stage greeting clip → public/audio/greeting.mp3
 *
 * The greeting is a STATIC clip (played instantly, in lock-step with the typewriter in
 * StageGreeting.tsx), so it must be regenerated whenever the GREETING text changes.
 *
 * Voice: same as the live TTS proxy (src/app/api/tts/route.ts) — ElevenLabs "Charlie"
 * (eleven_multilingual_v2) — so the greeting matches every other spoken clip in the demo.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... node scripts/gen-greeting-audio.mjs
 *   # or add ELEVENLABS_API_KEY (or Elevel_Labs) to .env.local, then:
 *   node scripts/gen-greeting-audio.mjs
 *
 * No key? It falls back to the macOS `say` voice so the clip at least matches the new text,
 * then prints a reminder to re-run with a key for Danny's real voice.
 */
import { writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "audio", "greeting.mp3");

// MUST stay in sync with GREETING in src/components/StageGreeting.tsx.
const GREETING = "Hi Danny, I am your second brain. How can I help you today?";

// Same voice/model/settings as src/app/api/tts/route.ts.
const VOICE = process.env.ELEVENLABS_VOICE_ID || "IKne3meq5aSn9XLyUdCD"; // "Charlie"
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

async function keyFromEnvFile() {
  try {
    const env = await readFile(join(ROOT, ".env.local"), "utf8");
    const m = env.match(/^\s*(?:ELEVENLABS_API_KEY|Elevel_Labs)\s*=\s*(.+)\s*$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

async function viaElevenLabs(key) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: GREETING,
      model_id: MODEL,
      voice_settings: { stability: 0.62, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  await writeFile(OUT, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ greeting.mp3 written in Charlie's voice → ${OUT}`);
}

async function viaSayFallback() {
  const aiff = join(ROOT, "public", "audio", "_greeting.tmp.aiff");
  // Prefer the built-in "Daniel" (en-GB male) if installed; else the system default.
  let voiceArgs = ["-v", "Daniel"];
  try {
    await execFileP("say", [...voiceArgs, "-o", aiff, GREETING]);
  } catch {
    voiceArgs = [];
    await execFileP("say", ["-o", aiff, GREETING]);
  }
  await execFileP("ffmpeg", ["-y", "-i", aiff, "-codec:a", "libmp3lame", "-qscale:a", "4", OUT]);
  await execFileP("rm", ["-f", aiff]);
  console.warn(
    `\n⚠  No ElevenLabs key found — wrote a macOS \`say\` PLACEHOLDER (text-accurate, wrong voice).\n` +
      `   Re-run with a key for Danny's real voice:\n` +
      `     ELEVENLABS_API_KEY=sk_... node scripts/gen-greeting-audio.mjs\n`
  );
  console.log(`✓ placeholder greeting.mp3 written → ${OUT}`);
}

const key = process.env.ELEVENLABS_API_KEY || process.env.Elevel_Labs || (await keyFromEnvFile());
try {
  if (key) await viaElevenLabs(key);
  else await viaSayFallback();
} catch (err) {
  console.error("greeting audio generation failed:", err.message || err);
  process.exit(1);
}
