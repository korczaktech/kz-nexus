const CACHE = "kz-nexus-ios-v4";
const BASE = new URL("./", self.registration.scope).pathname;
const SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "manifest.webmanifest",
  BASE + "icons/nexus-icon-192.svg",
  BASE + "icons/nexus-icon-512.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("kz-nexus-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(BASE, response.clone()));
        return response;
      }).catch(() => caches.match(BASE).then(r => r || caches.match(BASE + "index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});