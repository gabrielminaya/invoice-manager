import type { ReactNode } from "react";
import { BRAND_COLOR } from "@/lib/brand-icon";

/**
 * Marco de las pantallas sin sesión (login y configuración inicial).
 *
 * No lleva barra de pestañas: sin sesión no hay nada a lo que navegar, y en la
 * app instalada conviene que esas pantallas se vean como un paso aparte.
 *
 * En móvil el formulario ocupa el ancho disponible; a partir de tablet la
 * columna se limita y se centra, porque un formulario de dos campos estirado a
 * todo el ancho de un portátil se lee mal.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
      <div className="pt-safe" />

      <div className="w-full max-w-[26rem] lg:max-w-[28rem]">
        <header className="mb-6 space-y-2 sm:mb-8">
          <div
            className="mb-4 flex size-12 items-center justify-center rounded-2xl text-white shadow-lift sm:size-14"
            style={{ background: BRAND_COLOR }}
            aria-hidden="true"
          >
            {/* Hoja de factura, el mismo glifo del icono de la app. */}
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="sm:size-7">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M9 13h6" />
              <path d="M9 17h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>
        </header>

        {children}
      </div>

      <div className="pb-safe" />
    </main>
  );
}
