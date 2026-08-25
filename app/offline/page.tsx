import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ui";

export const metadata = { title: "Sin conexión" };

/**
 * Página de respaldo que sirve el service worker cuando una navegación no
 * alcanza la red. Es estática a propósito: tiene que estar en el cache.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="rounded-full bg-surface-2 p-4 text-faint">
        <Icon name="offline" size={28} />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">Sin conexión</h1>
        <p className="max-w-xs text-sm text-muted">
          Las facturas se consultan y emiten en el servidor, así que necesitas
          conexión. Vuelve a intentarlo cuando recuperes la señal.
        </p>
      </div>
      <LinkButton href="/" variant="secondary">
        Reintentar
      </LinkButton>
    </main>
  );
}
