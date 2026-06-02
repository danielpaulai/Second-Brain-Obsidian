"use client";

/**
 * Client-side text-to-speech via the /api/tts ElevenLabs proxy.
 * Speaks one utterance at a time (a new speak() interrupts the previous one).
 */

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSpeaking() {
  if (current) {
    current.onended = null;
    current.pause();
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function isSpeaking() {
  return !!current && !current.paused;
}

/**
 * Play a PRE-GENERATED static audio clip (e.g. /audio/greeting.mp3) instantly — no fetch,
 * so it starts in lock-step with its text. Interrupts anything currently speaking.
 */
export function playClip(src: string, onEnded?: () => void) {
  stopSpeaking();
  const audio = new Audio(src);
  current = audio;
  currentUrl = null;
  audio.onended = () => {
    if (current === audio) current = null;
    onEnded?.();
  };
  audio.play().catch(() => onEnded?.());
}

/** Strip markdown / wikilinks so the spoken text reads naturally. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, "$1") // [[Note|alias]] → Note
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/https?:\/\/\S+/g, " ") // bare URLs (TTS chokes on these)
    .replace(/[*_>#~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    // Strip emoji / pictographs / symbols / variation selectors — these make the voice glitch.
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pre-generate the audio for `text` WITHOUT playing it. Resolves only once the voice clip
 * has been fully fetched (i.e. the voice is "ready"), returning a `play()` you fire at the
 * exact moment you reveal the matching text — so text + audio land together. Returns null
 * if there's nothing to say or the request fails (caller should reveal text anyway).
 */
export async function prepareSpeech(
  text: string
): Promise<((onEnded?: () => void) => void) | null> {
  const body = cleanForSpeech(text);
  if (!body) return null;

  let res: Response;
  try {
    res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const blob = await res.blob(); // full clip downloaded → voice is generated/ready
  const url = URL.createObjectURL(blob);

  return (onEnded?: () => void) => {
    stopSpeaking(); // interrupt anything mid-flight (e.g. the greeting)
    const audio = new Audio(url);
    current = audio;
    currentUrl = url;
    audio.onended = () => {
      if (current === audio) {
        URL.revokeObjectURL(url);
        current = null;
        currentUrl = null;
      }
      onEnded?.();
    };
    audio.play().catch(() => onEnded?.());
  };
}

/**
 * Speak `text`. Resolves once playback has STARTED (not finished).
 * onEnded fires when audio finishes; onError on failure.
 */
export async function speak(
  text: string,
  opts?: { onEnded?: () => void; onError?: (e: unknown) => void }
): Promise<void> {
  stopSpeaking();
  const body = cleanForSpeech(text);
  if (!body) return;

  let res: Response;
  try {
    res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    });
  } catch (e) {
    opts?.onError?.(e);
    return;
  }
  if (!res.ok) {
    opts?.onError?.(new Error(`tts ${res.status}`));
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  current = audio;
  currentUrl = url;

  audio.onended = () => {
    if (current === audio) {
      URL.revokeObjectURL(url);
      current = null;
      currentUrl = null;
    }
    opts?.onEnded?.();
  };

  try {
    await audio.play();
  } catch (e) {
    // Autoplay can be blocked without a user gesture; surface it.
    opts?.onError?.(e);
  }
}
