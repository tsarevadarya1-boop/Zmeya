/* Service worker: офлайн-кэш игры «Путь Змеи». */
const CACHE = "put-zmei-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сеть → кэш (офлайн-фолбэк на index.html)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put("./index.html", copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((hit) => hit || Response.error())
        )
    );
    return;
  }

  // Остальное: кэш → сеть (с сохранением в кэш)
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches
                .open(CACHE)
                .then((c) => c.put(req, copy))
                .catch(() => {});
            }
            return res;
          })
          .catch(() => caches.match("./index.html"))
    )
  );
});
