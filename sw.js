const CACHE_NAME = "po-directory-v9";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  if (
    event.request.url.includes("supabase.co") ||
    event.request.url.includes("generate_204") ||
    event.request.url.includes("postalpincode.in")
  ) {
    return;
  }

  // Always serve cached index.html immediately for page navigations (eliminates top progress bar)
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match("./index.html", { ignoreSearch: true }).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((res) => {
              if (res && res.status === 200) {
                cache.put("./index.html", res.clone());
              }
              return res;
            })
            .catch(() => null);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        return cachedResponse || networkFetch;
      })
    )
  );
});