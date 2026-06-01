"use client";

import { getProject, types, type ISheet, type IProject } from "@theatre/core";

/**
 * Theatre.js project — choreography of the cinematic burst.
 *
 * Persistence:
 *   - On init, GET /api/choreo to hydrate any saved state from the vault.
 *   - Save button (deck) POSTs current state to /api/choreo.
 *   - Studio hidden by default; toggled via ⌘+E or the Choreo deck button.
 */

const PROJECT_ID = "AI Danny Presentation";

let _project: IProject | null = null;
let _sheet: ISheet | null = null;
let _studioAttached = false;
let _studioRef: any = null;
let _isHidden = true;
const _subs = new Set<(visible: boolean) => void>();

async function loadSavedState(): Promise<Record<string, unknown> | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const res = await fetch("/api/choreo");
    if (!res.ok) return undefined;
    const j = await res.json();
    return j?.state ?? undefined;
  } catch {
    return undefined;
  }
}

/** Lazy-init the project. First call may hit /api/choreo for saved state. */
async function ensureProject(): Promise<IProject> {
  if (_project) return _project;
  const saved = await loadSavedState();
  _project = getProject(PROJECT_ID, saved ? { state: saved as any } : undefined);
  return _project;
}

/**
 * Synchronous accessor for the sheet. If the project hasn't loaded yet,
 * we kick off the async load AND return a temporary project so the UI
 * doesn't block. Saved state will hydrate on next call.
 */
export function getPresentationSheet(): ISheet {
  if (_sheet) return _sheet;
  if (!_project) {
    _project = getProject(PROJECT_ID); // immediate, no saved state
    // background load + replace (no-op if no saved state)
    void ensureProject();
  }
  _sheet = _project.sheet("Cinematic Burst");
  return _sheet;
}

export async function attachStudioIfDev() {
  if (_studioAttached) return;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "development") return;
  // Make sure project is loaded with saved state before studio attaches
  await ensureProject();
  const { default: studio } = await import("@theatre/studio");
  studio.initialize();
  studio.ui.hide();
  _studioRef = studio;
  _isHidden = true;
  _studioAttached = true;
}

export function toggleStudio(): boolean {
  if (!_studioRef) return false;
  if (_isHidden) {
    _studioRef.ui.restore();
    _isHidden = false;
  } else {
    _studioRef.ui.hide();
    _isHidden = true;
  }
  _subs.forEach((s) => s(!_isHidden));
  return !_isHidden;
}

export function isStudioVisible(): boolean {
  return !_isHidden;
}

export function onStudioVisibilityChange(cb: (visible: boolean) => void) {
  _subs.add(cb);
  return () => _subs.delete(cb);
}

/** Save current choreo state to the vault. Returns true on success. */
export async function saveChoreoState(): Promise<boolean> {
  if (!_studioRef) return false;
  try {
    const state = _studioRef.createContentOfSaveFile(PROJECT_ID);
    const res = await fetch("/api/choreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch (err) {
    console.error("[theatre] save failed:", err);
    return false;
  }
}

export { types };
