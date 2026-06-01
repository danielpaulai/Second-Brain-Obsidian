"use client";

import { useEffect } from "react";
import { attachStudioIfDev } from "@/lib/theatre";

/**
 * Mounts the Theatre.js Studio (visual animation editor) in dev mode.
 * Press ⌘+\ to open. Edits flow into `getPresentationSheet()` and can be
 * saved as a JSON snapshot that plays in production.
 *
 * In prod builds, this component is a no-op — studio code is tree-shaken.
 */
export default function TheatreBootstrap() {
  useEffect(() => {
    void attachStudioIfDev();
  }, []);
  return null;
}
