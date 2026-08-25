import { CompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";

export const metadata = { title: "Nueva compañía" };

export default async function NewCompanyPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Nueva compañía"
        subtitle="Datos fiscales del emisor"
        backHref="/settings"
      />
      <main className="page-shell form-shell py-4">
        <CompanyForm />
      </main>
    </>
  );
}
