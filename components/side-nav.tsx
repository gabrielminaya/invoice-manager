"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { NAV_TABS } from "@/components/nav-tabs";

/**
 * Navegación lateral para tablet y escritorio.
 *
 * Sustituye a la barra inferior desde `md`: en pantallas anchas la barra de
 * pestañas abajo queda lejos del cursor y desperdicia altura, mientras que una
 * columna fija deja siempre visible dónde estás.
 *
 * Entre `md` y `lg` se muestra como raíl estrecho de iconos, porque a 768 px una
 * barra con etiquetas se comería el espacio que necesita la tabla de facturas.
 */
export function SideNav({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface md:flex md:w-[4.75rem] md:flex-col lg:w-60 no-print">
      <div className="pt-safe" />

      <div className="flex items-center gap-2.5 px-3 py-4 lg:px-4">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
          aria-hidden="true"
        >
          <Icon name="invoice" size={19} />
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-[0.9375rem] font-semibold leading-tight text-ink">
            Facturación
          </span>
          <span className="block truncate text-xs text-muted">{userName}</span>
        </span>
      </div>

      <nav aria-label="Navegación lateral" className="flex-1 space-y-1 px-2 py-2 lg:px-3">
        {NAV_TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              title={tab.label}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-2 text-[0.9375rem] font-medium transition-colors lg:px-3 ${
                active
                  ? "bg-accent-soft text-accent-text"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              } max-lg:flex-col max-lg:justify-center max-lg:gap-1 max-lg:py-2`}
            >
              <Icon name={tab.icon} size={21} className="shrink-0" />
              <span className="truncate max-lg:text-[0.625rem]">{tab.shortLabel ?? tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pb-safe" />
    </aside>
  );
}
