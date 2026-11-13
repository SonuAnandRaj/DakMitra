const CACHE_NAME = "po-directory-v3"; // <-- Bumped from v2 to v3
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Network-First Strategy (for Static App Shell & CDN Assets)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Prevent caching of unsupported schemes like chrome-extension://
  if (!event.request.url.startsWith("http")) return;

  // Bypass Service Worker cache for live Supabase database/auth API requests
  // and Google's 204 internet check (handled directly in index.html)
  if (
    event.request.url.includes("supabase.co") ||
    event.request.url.includes("generate_204")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Only cache complete 200 OK responses to prevent Partial Content 206 errors
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache, and if it's a page navigation request, serve index.html
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      }),
  );
});
