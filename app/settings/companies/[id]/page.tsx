import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { CompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";

export async function generateMetadata(props: PageProps<"/settings/companies/[id]">) {
  const { id } = await props.params;
  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return { title: company?.name ?? "Compañía" };
}

export default async function EditCompanyPage(props: PageProps<"/settings/companies/[id]">) {
  await requireUser();

  const { id } = await props.params;
  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!company) notFound();

  return (
    <>
      <PageHeader title="Editar compañía" subtitle={company.name} backHref="/settings" />
      <main className="page-shell form-shell py-4">
        <CompanyForm company={company} />
      </main>
    </>
  );
}
