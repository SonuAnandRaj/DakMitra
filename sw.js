const CACHE_NAME = "po-directory-v11";
const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(LOCAL_ASSETS);
      // Cache CDN scripts individually so a flaky network never breaks SW install
      await Promise.allSettled(
        CDN_ASSETS.map((url) =>
          fetch(url).then((res) => {
            if (res && res.status === 200) return cache.put(url, res);
          })
        )
      );
    })
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

// Helper: Fetch with a timeout so Lie-Fi doesn't hang the app
function fetchWithTimeout(request, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    fetch(request, { cache: "no-cache" })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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

  // NETWORK-FIRST for index.html / navigation: Always gets the latest deployed version when online
  if (
    event.request.mode === "navigate" ||
    event.request.url.endsWith("index.html")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetchWithTimeout(event.request, 1000)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put("./index.html", networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cache.match("./index.html", { ignoreSearch: true }))
      )
    );
    return;
  }

  // STALE-WHILE-REVALIDATE for static assets (icons, CDN libraries, fonts)
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