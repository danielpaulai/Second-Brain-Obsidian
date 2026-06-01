// AI Danny — service worker
// Minimal offline shell + cache-first for hashed static assets.
// On any API call, falls through to the network so we never serve stale data.

const VERSION = "ai-danny-v1";
const CACHE_PRECACHE = `${VERSION}-precache`;
const CACHE_RUNTIME = `${VERSION}-runtime`;
const PRECACHE = [
  "/",
  "/ask",
  "/brain-map",
  "/memories",
  "/login",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_PRECACHE).then((cache) =>
      // Fail-soft: don't reject install if a route 404s in dev
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. API + chat streams + Supabase auth → always network, never cache
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("anthropic")
  ) {
    return; // let the browser handle it
  }

  // 2. Hashed static chunks → cache-first (immutable)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/)
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 3. HTML pages → network-first with cache fallback (so updates show immediately)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/")))
    );
  }
});
