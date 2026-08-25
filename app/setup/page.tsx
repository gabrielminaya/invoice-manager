import { redirect } from "next/navigation";
import { hasAnyUser, redirectIfAuthenticated } from "@/lib/auth/dal";
import { SetupForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";

export const metadata = { title: "Configuración inicial" };
export const dynamic = "force-dynamic";

/**
 * Arranque de la instalación: crea el primer usuario.
 *
 * Deja de ser accesible en cuanto existe un usuario, así que no es un registro
 * abierto. La acción vuelve a comprobarlo con la tabla bloqueada, porque esta
 * pantalla es solo la primera barrera.
 */
export default async function SetupPage() {
  await redirectIfAuthenticated();
  if (await hasAnyUser()) redirect("/login");

  return (
    <AuthShell
      title="Configura tu instalación"
      subtitle="Crea la cuenta de administración. Es el primer y único paso."
    >
      <SetupForm />

      <ol className="mt-6 space-y-2.5 text-[0.8125rem] text-muted">
        <li className="flex gap-2.5">
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
          <span>Después podrás registrar tu compañía emisora y sus clientes.</span>
        </li>
        <li className="flex gap-2.5">
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
          <span>
            Nadie más podrá usar esta pantalla: en cuanto exista una cuenta, queda cerrada.
          </span>
        </li>
      </ol>
    </AuthShell>
  );
}
