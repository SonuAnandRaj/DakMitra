const CACHE_NAME = "po-directory-v58";

const IS_LOCAL_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

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

  const reqUrl = new URL(event.request.url);
  const isSameOrigin = reqUrl.origin === self.location.origin;
  const isNavigation =
    event.request.mode === "navigate" ||
    reqUrl.pathname.endsWith("/index.html") ||
    reqUrl.pathname === "/index.html";

  const cacheKey = isNavigation ? "./index.html" : event.request;
  const fetchInput = isNavigation
    ? "./index.html"
    : isSameOrigin
    ? event.request.url
    : event.request;
  const fetchInit =
    isNavigation || isSameOrigin ? { cache: "no-cache" } : undefined;

  let cacheWritePromise = Promise.resolve();

  const networkFetch = fetch(fetchInput, fetchInit)
    .then((networkResponse) => {
      const isCacheable = isNavigation
        ? Boolean(
            networkResponse &&
              networkResponse.status === 200 &&
              !networkResponse.redirected
          )
        : Boolean(
            networkResponse &&
              (networkResponse.status === 200 ||
                (isPublicAvatar && networkResponse.type === "opaque"))
          );

      if (isCacheable) {
        const responseToCache = networkResponse.clone();
        cacheWritePromise = caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(cacheKey, responseToCache))
          .catch(() => {});
      }
      return networkResponse;
    })
    .catch(() => null);

  event.waitUntil(networkFetch.then(() => cacheWritePromise));

  // Local dev (localhost / 127.0.0.1): Network-First for local files, Cache fallback when offline
  if (IS_LOCAL_DEV && (isNavigation || isSameOrigin)) {
    event.respondWith(
      networkFetch.then((networkResponse) => {
        if (networkResponse) return networkResponse;
        return caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(cacheKey, { ignoreSearch: true }));
      })
    );
    return;
  }

  // Production (GitHub Pages) & cross-origin assets: 0ms Cache-First + background revalidation (SWR)
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(cacheKey, { ignoreSearch: true }))
      .then((cachedResponse) => cachedResponse || networkFetch)
  );
});
