"use client";

import { create } from "zustand";
import { startAmbientDrone, stopAmbientDrone } from "./cinema-audio";

/**
 * Global presentation-mode state.
 *
 * Toggle keyboard shortcut: ⌘+Shift+P (Cmd on mac, Ctrl on win/linux).
 * When ON: the 2D canvas brain is replaced by the cinematic r3f scene,
 * vignette + chromatic aberration overlays appear, and chat submits
 * trigger a choreographed GSAP timeline.
 */

type PresentationState = {
  on: boolean;
  /** Notes currently being "fired at" by a query — drives the cinematic burst */
  firing: string[];
  toggle: () => void;
  set: (v: boolean) => void;
  fire: (notes: string[]) => void;
  clearFiring: () => void;
};

export const usePresentation = create<PresentationState>((set) => ({
  on: false,
  firing: [],
  toggle: () =>
    set((s) => {
      const next = !s.on;
      // Side-effect: start/stop ambient drone when toggling stage mode
      if (next) void startAmbientDrone();
      else void stopAmbientDrone();
      return { on: next };
    }),
  set: (v) => {
    if (v) void startAmbientDrone();
    else void stopAmbientDrone();
    set({ on: v });
  },
  fire: (notes) => set({ firing: notes }),
  clearFiring: () => set({ firing: [] }),
}));
