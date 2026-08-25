import { requireUser } from "@/lib/auth/dal";
import { ChangePasswordForm } from "@/components/user-forms";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Mi cuenta" subtitle={user.email} backHref="/settings" />
      <main className="page-shell form-shell py-4">
        <ChangePasswordForm />
      </main>
    </>
  );
}
