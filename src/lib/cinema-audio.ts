"use client";

/**
 * Tone.js cinematic audio layer.
 *
 * Sits ABOVE the simple Web Audio synth in sounds.ts. Provides:
 *   - Ambient drone (always on when stage mode is enabled)
 *   - Submit sub-thump
 *   - Thinking swell (loops while waiting)
 *   - Reply chime cluster
 *
 * Loaded lazily — Tone.js initializes only after the first user gesture
 * (required by browser audio policy). Until then, all calls are no-ops.
 */

import type * as ToneNS from "tone";

type ToneModule = typeof ToneNS;

let _tone: ToneModule | null = null;
let _ready = false;
let _initing = false;

let _droneSynth: any = null;
let _droneFilter: any = null;
let _droneGain: any = null;
let _droneOn = false;

let _swellSynth: any = null;
let _swellGain: any = null;
let _swellLoop: any = null;

let _master: any = null;

async function ensureTone() {
  if (_ready) return _tone;
  if (_initing) {
    while (_initing) await new Promise((r) => setTimeout(r, 30));
    return _tone;
  }
  if (typeof window === "undefined") return null;
  _initing = true;
  try {
    const mod = await import("tone");
    _tone = mod as any;
    // Resume audio context on first call (browser policy: user gesture required)
    if (_tone!.context.state !== "running") {
      try {
        await _tone!.start();
      } catch {
        /* user gesture may not have happened yet; safe to ignore */
      }
    }
    _master = new _tone!.Gain(0.9).toDestination();
    _ready = true;
  } catch (err) {
    console.warn("[cinema-audio] Tone.js init failed:", err);
  } finally {
    _initing = false;
  }
  return _tone;
}

/* ---------- Ambient drone -------------------------------------------------- */

export async function startAmbientDrone() {
  const T = await ensureTone();
  if (!T || _droneOn) return;
  _droneFilter = new T.Filter({ frequency: 700, type: "lowpass", Q: 0.7 }).connect(_master);
  _droneGain = new T.Gain(0).connect(_droneFilter);
  // Two-oscillator pad — root + perfect fifth, slowly detuning
  _droneSynth = new T.PolySynth(T.AMSynth, {
    harmonicity: 1.5,
    envelope: { attack: 4, decay: 0, sustain: 1, release: 4 },
    modulation: { type: "sine" } as any,
    modulationEnvelope: { attack: 6, decay: 0, sustain: 1, release: 6 },
  }).connect(_droneGain);
  _droneSynth.triggerAttack(["C2", "G2"]);
  _droneGain.gain.linearRampToValueAtTime(0.06, T.now() + 4);
  // Slow LFO on the filter for movement
  const lfo = new T.LFO({ frequency: 0.06, min: 380, max: 1100 }).start();
  lfo.connect(_droneFilter.frequency);
  _droneOn = true;
}

export async function stopAmbientDrone() {
  if (!_tone || !_droneOn) return;
  const T = _tone;
  if (_droneGain) _droneGain.gain.linearRampToValueAtTime(0, T.now() + 1.6);
  setTimeout(() => {
    try {
      _droneSynth?.releaseAll();
      _droneSynth?.dispose();
      _droneFilter?.dispose();
      _droneGain?.dispose();
    } catch {}
    _droneSynth = null;
    _droneFilter = null;
    _droneGain = null;
  }, 2000);
  _droneOn = false;
}

/* ---------- Submit sub-thump ---------------------------------------------- */

export async function submitThump() {
  const T = await ensureTone();
  if (!T) return;
  const osc = new T.Oscillator({ type: "sine", frequency: 80 }).connect(_master);
  const env = new T.AmplitudeEnvelope({ attack: 0.01, decay: 0.18, sustain: 0, release: 0.2 }).connect(_master);
  osc.connect(env);
  osc.frequency.exponentialRampTo(48, 0.4);
  osc.start();
  env.triggerAttackRelease(0.3);
  setTimeout(() => { try { osc.stop(); osc.dispose(); env.dispose(); } catch {} }, 700);
}

/* ---------- Thinking swell ------------------------------------------------ */

export async function startThinkingSwell() {
  const T = await ensureTone();
  if (!T || _swellLoop) return;
  _swellGain = new T.Gain(0).connect(_master);
  const reverb = new T.Reverb({ decay: 6, wet: 0.55 }).connect(_swellGain);
  _swellSynth = new T.PolySynth(T.FMSynth, {
    modulationIndex: 4,
    envelope: { attack: 1.2, decay: 0.4, sustain: 0.4, release: 1.6 },
  }).connect(reverb);

  // Cycle through a soft minor-9 voicing
  const chords = [
    ["G3", "Bb3", "D4", "F4"],
    ["F3", "Ab3", "C4", "Eb4"],
    ["Eb3", "G3", "Bb3", "D4"],
  ];
  let idx = 0;
  _swellLoop = new T.Loop((time: number) => {
    _swellSynth.triggerAttackRelease(chords[idx], "4n", time, 0.18);
    idx = (idx + 1) % chords.length;
  }, "2n").start(0);
  T.Transport.start();
  _swellGain.gain.linearRampToValueAtTime(0.18, T.now() + 0.8);
}

export async function stopThinkingSwell() {
  if (!_tone || !_swellLoop) return;
  const T = _tone;
  _swellGain?.gain.linearRampToValueAtTime(0, T.now() + 0.6);
  setTimeout(() => {
    try {
      _swellLoop?.stop();
      _swellLoop?.dispose();
      _swellSynth?.releaseAll();
      _swellSynth?.dispose();
      _swellGain?.dispose();
    } catch {}
    _swellLoop = null;
    _swellSynth = null;
    _swellGain = null;
  }, 1000);
}

/* ---------- Reply chime cluster ------------------------------------------- */

export async function replyChime() {
  const T = await ensureTone();
  if (!T) return;
  const synth = new T.PolySynth(T.Synth, {
    oscillator: { type: "sine" } as any,
    envelope: { attack: 0.01, decay: 0.6, sustain: 0, release: 0.6 },
  }).connect(_master);
  const reverb = new T.Reverb({ decay: 3, wet: 0.4 }).toDestination();
  synth.connect(reverb);
  // A bright open voicing — like a star sparkle
  synth.triggerAttackRelease(["C5", "E5", "G5", "C6"], "8n", undefined, 0.18);
  setTimeout(() => {
    try { synth.dispose(); reverb.dispose(); } catch {}
  }, 2500);
}
