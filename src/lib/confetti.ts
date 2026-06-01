"use client";

import confetti from "canvas-confetti";

/**
 * Subtle confetti bursts for celebration moments.
 * Designed to be tasteful — purple/white particles, brief, low count.
 */

export function celebrateReply(originX = 0.5, originY = 0.6) {
  confetti({
    particleCount: 60,
    spread: 70,
    startVelocity: 32,
    decay: 0.92,
    gravity: 0.4,
    ticks: 200,
    origin: { x: originX, y: originY },
    colors: ["#a78bfa", "#c4b5fd", "#7c3aed", "#ddd6fe", "#f5f3ff"],
    shapes: ["circle"],
    scalar: 0.7,
    disableForReducedMotion: true,
  });
}

export function celebrateSave() {
  confetti({
    particleCount: 24,
    spread: 50,
    startVelocity: 20,
    decay: 0.9,
    gravity: 0.5,
    ticks: 140,
    origin: { y: 0.92 },
    colors: ["#a78bfa", "#c4b5fd", "#86efac"],
    shapes: ["circle"],
    scalar: 0.55,
    disableForReducedMotion: true,
  });
}

export function celebrateStageEnter() {
  // Big sweeping burst from the bottom of the screen
  const end = Date.now() + 600;
  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 1 },
      colors: ["#a78bfa", "#c4b5fd"],
      scalar: 0.6,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 1 },
      colors: ["#a78bfa", "#c4b5fd"],
      scalar: 0.6,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
