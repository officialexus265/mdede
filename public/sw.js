// App-shell offline cache for M'dede Restaurant.
//
// Strategy: network-first, falling back to cache when the network fails.
// - Never touches non-GET requests, so it can never intercept or mask a
//   server-function write (order/payment/void/etc all go over POST) — those
//   correctly fail loudly when offline; see `src/lib/offline-queue.ts` for
//   the one write type that's deliberately queued client-side instead.
// - Only caches same-origin responses.
// - Always tries the network first, so anyone online gets the latest build;
//   the cache is purely a fallback for when the connection drops.
const CACHE_NAME = "mdede-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Navigations (e.g. a refresh while offline) fall back to the
        // cached app shell rather than a browser error page.
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
