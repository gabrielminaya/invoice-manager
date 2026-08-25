import { redirect } from "next/navigation";
import { hasAnyUser, redirectIfAuthenticated } from "@/lib/auth/dal";
import { LoginForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  await redirectIfAuthenticated();

  // Sin usuarios no hay credenciales que pedir: toca configurar la instalación.
  if (!(await hasAnyUser())) redirect("/setup");

  const params = await props.searchParams;
  const redirectTo = typeof params.redirectTo === "string" ? params.redirectTo : undefined;

  return (
    <AuthShell
      title="Facturación recurrente"
      subtitle="Entra para gestionar tus facturas y recurrencias."
    >
      <LoginForm redirectTo={redirectTo} />
    </AuthShell>
  );
}
