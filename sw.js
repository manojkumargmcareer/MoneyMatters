const CACHE = "moneymatters-shell-v16";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icons/paisaos-192.png", "./icons/paisaos-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("moneymatters-shell-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network-first for app files: use the latest deployment whenever online,
// but fall back to the last cached copy when offline. Never cache API/non-GET requests.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const isNavigation = request.mode === "navigate";
    try {
      const response = await fetch(request, { cache: "no-store" });
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        const key = isNavigation ? new URL("./", self.registration.scope).href : request;
        await cache.put(key, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request) || (isNavigation ? await caches.match("./index.html") || await caches.match("./") : null);
      if (cached) return cached;
      return new Response("MoneyMatters is offline and this page is not cached yet. Connect to the internet and reopen the app.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
