import type { MetadataRoute } from "next";
import { BRAND_COLOR } from "@/lib/brand-icon";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Facturación recurrente",
    short_name: "Facturas",
    description:
      "Emite y cobra facturas recurrentes de tus clientes desde el móvil, con múltiples compañías emisoras.",
    id: "/",
    start_url: "/",
    scope: "/",
    // standalone: se abre sin barra de navegador, como una app instalada.
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: BRAND_COLOR,
    lang: "es-DO",
    dir: "ltr",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Accesos rápidos del menú contextual del icono instalado.
    shortcuts: [
      { name: "Nueva factura", url: "/invoices/new" },
      { name: "Recurrencias", url: "/subscriptions" },
      { name: "Clientes", url: "/clients" },
    ],
  };
}
