import type { IconName } from "@/components/icons";

/**
 * Destinos de la navegación principal.
 *
 * Se comparten entre la barra inferior (móvil) y la lateral (tablet y
 * escritorio) para que no puedan desincronizarse.
 */
export const NAV_TABS: {
  href: string;
  label: string;
  /** Versión corta para el raíl estrecho y la barra inferior. */
  shortLabel?: string;
  icon: IconName;
}[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/invoices", label: "Facturas", icon: "invoice" },
  { href: "/subscriptions", label: "Recurrencias", shortLabel: "Recurrencia", icon: "repeat" },
  { href: "/clients", label: "Clientes", icon: "users" },
  { href: "/settings", label: "Ajustes", icon: "settings" },
];
