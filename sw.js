const CACHE_NAME = "po-directory-v8";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=optional",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
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
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Stale-While-Revalidate: Instant 0ms load from cache, silent update in background
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  // Never cache live Supabase API calls or connectivity checks
  if (
    event.request.url.includes("supabase.co") ||
    event.request.url.includes("generate_204") ||
    event.request.url.includes("postalpincode.in")
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached response IMMEDIATELY if we have it; otherwise wait for network
        if (cachedResponse) {
          return cachedResponse;
        }
        return networkFetch.then((res) => {
          if (res) return res;
          if (event.request.mode === "navigate") {
            return cache.match("./index.html");
          }
        });
      });
    })
  );
});