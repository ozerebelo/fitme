/*
 * FitMe service worker.
 *
 * The app is local-first — all user data lives in IndexedDB — so the only thing
 * the network is needed for is delivering the app shell itself. Caching that
 * means the logger works in a basement gym with no signal, which is exactly
 * where it gets used.
 *
 * Deliberately conservative: API calls are never cached (a stale meal analysis
 * or coach answer would be worse than an honest failure), and navigations
 * prefer the network so a deployed update is picked up on the next online load.
 */

const VERSION = "fitme-v1";
const SHELL = ["/", "/food", "/train", "/progress", "/coach", "/settings", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Individual failures must not abort the install; a partially warmed
      // cache is still better than none.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Build output is content-hashed and immutable — cache first, always.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network first, so updates land; cache is the offline safety net.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match("/"))),
    );
    return;
  }

  // Everything else: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => hit);
      return hit ?? network;
    }),
  );
});
