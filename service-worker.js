// Network-first service worker: installability + basic offline fallback,
// but never serves a stale version while online (data/faq.json changes often).
const CACHE = "camp-enoki-site-v1";
const SHELL = [
  "./",
  "index.html",
  "css/styles.css",
  "js/data-store.js",
  "js/i18n.js",
  "js/faq-engine.js",
  "js/ai-adapter.js",
  "js/booking-wizard.js",
  "js/chat-widget.js",
  "js/main.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
