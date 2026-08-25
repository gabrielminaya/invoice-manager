"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Avisa cuando el dispositivo pierde la conexión. En una app instalada el
 * usuario no ve la barra del navegador, así que sin esto no hay ninguna señal
 * de que los datos en pantalla puedan estar desactualizados.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-xs font-medium text-warning no-print"
    >
      <Icon name="offline" size={14} />
      Sin conexión — los datos pueden estar desactualizados
    </div>
  );
}
