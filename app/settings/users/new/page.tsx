import { requireUser } from "@/lib/auth/dal";
import { NewUserForm } from "@/components/user-forms";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Nuevo usuario" };

export default async function NewUserPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Nuevo usuario"
        subtitle="Tendrá acceso completo a la facturación"
        backHref="/settings"
      />
      <main className="page-shell form-shell py-4">
        <NewUserForm />
      </main>
    </>
  );
}
