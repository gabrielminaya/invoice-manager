"use client";

import { useEffect } from "react";

/**
 * Registra el service worker una vez cargada la página.
 *
 * Se hace en un efecto (y no en el HTML) para no competir con la carga inicial,
 * y solo en producción: en desarrollo un SW cacheando el bundle estorba al
 * recargar en caliente.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.error("[pwa] no se pudo registrar el service worker", error));
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
