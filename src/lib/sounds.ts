// Tiny Web-Audio-synthesized sounds — no audio assets needed.
// Subtle by design: short, soft, low-volume.

let ctx: AudioContext | null = null;
let muted = false;
if (typeof window !== "undefined") {
  try {
    muted = localStorage.getItem("jarvis_sound_muted") === "1";
  } catch {
    /* storage disabled — default to on */
  }
}
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur);
}

export const sounds = {
  send: () => tone(880, 0.08, "triangle", 0.04),
  reply: () => {
    tone(660, 0.09, "sine", 0.045);
    setTimeout(() => tone(990, 0.11, "sine", 0.04), 60);
  },
  switchAgent: () => tone(520, 0.06, "triangle", 0.035),
  open: () => tone(420, 0.07, "sine", 0.04),

  /* Very subtle "a card appeared" notification — a soft, quiet two-note tick. */
  notify: () => {
    tone(1180, 0.05, "sine", 0.022);
    setTimeout(() => tone(1560, 0.06, "sine", 0.018), 42);
  },

  /* Stage / cinematic sounds */
  cinematicWhoosh: () => {
    // Glissando from low to high to signal "query firing"
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(720, c.currentTime + 0.6);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.08, c.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.7);
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    osc.connect(filter).connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.75);
  },
  cinematicChime: () => {
    // Soft bell — used per sentence as Danny streams
    const c = getCtx();
    if (!c) return;
    [880, 1320].forEach((f, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, c.currentTime + i * 0.025);
      g.gain.setValueAtTime(0, c.currentTime + i * 0.025);
      g.gain.linearRampToValueAtTime(0.03, c.currentTime + i * 0.025 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.025 + 0.45);
      osc.connect(g).connect(c.destination);
      osc.start(c.currentTime + i * 0.025);
      osc.stop(c.currentTime + i * 0.025 + 0.5);
    });
  },
  citeNote: () => {
    // Distinct ping when a [[wikilink]] streams in
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1480, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2200, c.currentTime + 0.15);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.25);
  },

  /* A soft, subtle tick as a feed message streams in. */
  message: () => tone(1320, 0.045, "sine", 0.018),

  /* A warm, satisfying 3-note resolve when a run completes. */
  complete: () => {
    [660, 880, 1320].forEach((f, i) =>
      setTimeout(() => tone(f, 0.34, "sine", 0.04), i * 90)
    );
  },

  /* A low, gentle two-tone for an error / snag. */
  error: () => {
    tone(300, 0.16, "sine", 0.045);
    setTimeout(() => tone(220, 0.22, "sine", 0.04), 110);
  },
};

/* ---------------- Brain idle ambience ----------------
 * A barely-there warm drone for the /jarvis brain backdrop. Started while the
 * brain graph is on screen, stopped when a deliverable replaces it. Very quiet,
 * with a slow breathing LFO so it feels alive, not static. */
let ambient: { stop: () => void } | null = null;

export function ambientStart() {
  if (muted) return;
  const c = getCtx();
  if (!c || ambient) return;
  const master = c.createGain();
  master.gain.setValueAtTime(0, c.currentTime);
  master.gain.linearRampToValueAtTime(0.02, c.currentTime + 2.6); // gentle fade-in
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.connect(master).connect(c.destination);

  // a warm minor drone: sub + root + a touch of detune + a fifth
  const oscs: OscillatorNode[] = [];
  for (const [f, v] of [[55, 0.55], [110, 0.32], [110.4, 0.28], [164.8, 0.18]] as const) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = v;
    o.connect(g).connect(filter);
    o.start();
    oscs.push(o);
  }
  // slow "breathing" so the drone swells and recedes (~14s cycle)
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.009;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();

  ambient = {
    stop: () => {
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.linearRampToValueAtTime(0, t + 1.1);
      oscs.forEach((o) => o.stop(t + 1.3));
      lfo.stop(t + 1.3);
    },
  };
}

export function ambientStop() {
  ambient?.stop();
  ambient = null;
}

export function isMuted() {
  return muted;
}

/** Toggle all /jarvis sound. Persists, and starts/stops the brain ambience. */
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("jarvis_sound_muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (m) ambientStop();
  else ambientStart();
}

/**
 * Unlock Web Audio on the FIRST user gesture. Browsers create/keep the AudioContext suspended until
 * a gesture, and our node-hit + notification sounds first fire from the render loop / voice callbacks
 * (NOT a gesture) — so without this they stay silent in production. Creating + resuming the context
 * inside a real gesture (the Start click, any key/tap) unlocks it for the whole session.
 */
if (typeof window !== "undefined") {
  const unlock = () => {
    const c = getCtx(); // creates the context inside the gesture, then resumes it
    if (c && c.state === "suspended") void c.resume();
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(ev, unlock, { passive: true });
  }
}
