const CACHE_NAME = "po-directory-v53";

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  // Modular Stylesheets
  "./css/01-base-layout.css",
  "./css/02-components.css",
  "./css/03-views.css",
  "./css/04-learn.css",
  "./css/05-superadmin.css",
  // Modular Scripts
  "./js/01-config.js",
  "./js/02-utils.js",
  "./js/03-ui-shell.js",
  "./js/04-data-sync.js",
  "./js/05-auth-profile.js",
  "./js/06-search-ai.js",
  "./js/07-directory-staff.js",
  "./js/08-records-upload.js",
  "./js/09-approvals-favs.js",
  "./js/11-feedback.js",
  "./js/12-learn-quiz.js",
  "./js/10-settings-boot.js",
  "./js/13-superadmin.js",
];

const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Bypass browser HTTP cache on install so GitHub Pages always delivers the latest CSS/JS
      await cache.addAll(
        LOCAL_ASSETS.map((url) => new Request(url, { cache: "no-cache" }))
      );
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  const isPublicAvatar = event.request.url.includes(
    "/storage/v1/object/public/avatars/"
  );

  if (
    (!isPublicAvatar && event.request.url.includes("supabase.co")) ||
    event.request.url.includes("generate_204") ||
    event.request.url.includes("postalpincode.in")
  ) {
    return;
  }

  // CACHE-FIRST (STALE-WHILE-REVALIDATE) for navigation & index.html
  // Launches instantly in standalone mode even on slow internet, updates in background
  if (
    event.request.mode === "navigate" ||
    event.request.url.endsWith("index.html")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match("./index.html", {
          ignoreSearch: true,
        });

        const networkFetch = fetch("./index.html", { cache: "no-cache" })
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              !networkResponse.redirected
            ) {
              cache.put("./index.html", networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached shell immediately; only wait for network on very first visit
        return cached || networkFetch;
      })
    );
    return;
  }

  // STALE-WHILE-REVALIDATE for static assets (CSS, JS, manifest, icons, CDN libraries, fonts)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache
        .match(event.request, { ignoreSearch: true })
        .then((cachedResponse) => {
          const networkFetch = fetch(event.request)
            .then((networkResponse) => {
              if (
                networkResponse &&
                (networkResponse.status === 200 ||
                  (isPublicAvatar && networkResponse.type === "opaque"))
              ) {
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
