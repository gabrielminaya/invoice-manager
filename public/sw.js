/**
 * Service worker de la PWA de facturación.
 *
 * Estrategia deliberadamente conservadora: los datos de facturación cambian y
 * nunca deben servirse rancios, así que solo se cachean los recursos estáticos
 * y una página de respaldo para cuando no hay red.
 *
 *   - /_next/static, iconos, manifest  -> cache-first (tienen hash o son estables)
 *   - navegaciones                     -> red primero, y si falla, /offline
 *   - /api/*, POST, server actions      -> siempre a la red, nunca al cache
 */

const VERSION = "v1";
const STATIC_CACHE = `estatico-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll falla en bloque si un recurso falla; se cachea uno a uno para
      // que un 404 puntual no deje la instalación a medias.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            /* recurso no disponible ahora; se cacheará al usarse */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== STATIC_CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Mutaciones y APIs: directo a la red. Cachearlas daría facturas incorrectas.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithOfflineFallback(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Sin conexión", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
