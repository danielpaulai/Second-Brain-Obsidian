"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once on mount. Production-only by default —
 * `next dev` invalidates SW caches in confusing ways, so we skip in dev unless
 * NEXT_PUBLIC_PWA_DEV is set.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const isProd = process.env.NODE_ENV === "production";
    const pwaDev = process.env.NEXT_PUBLIC_PWA_DEV === "1";
    if (!isProd && !pwaDev) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Silent — PWA is progressive enhancement
          console.warn("[pwa] registration failed:", err);
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
