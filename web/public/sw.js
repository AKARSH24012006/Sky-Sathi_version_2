/* SkySathi SW: stale-while-revalidate for same-origin GET — instant loads, offline shell. */
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));
self.addEventListener("fetch", e => {
  const { request } = e;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  e.respondWith(caches.open("ss-v1").then(async cache => {
    const cached = await cache.match(request);
    const fresh = fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); return r; }).catch(() => cached);
    return cached || fresh;
  }));
});
