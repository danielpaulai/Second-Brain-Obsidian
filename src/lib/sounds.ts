// Tiny Web-Audio-synthesized sounds — no audio assets needed.
// Subtle by design: short, soft, low-volume.

let ctx: AudioContext | null = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05) {
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
};
