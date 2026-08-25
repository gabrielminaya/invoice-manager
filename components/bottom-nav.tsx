"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { NAV_TABS } from "@/components/nav-tabs";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación inferior"
      // Desde `md` manda la barra lateral.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-lg md:hidden no-print"
    >
      <div className="mx-auto flex max-w-3xl items-stretch">
        {NAV_TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[0.6875rem] font-medium transition-colors ${
                active ? "text-accent-text" : "text-faint hover:text-muted"
              }`}
            >
              <Icon name={tab.icon} size={22} />
              <span>{tab.shortLabel ?? tab.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="pb-safe" />
    </nav>
  );
}
