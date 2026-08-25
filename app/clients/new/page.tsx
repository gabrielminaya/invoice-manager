import { getActiveCompany } from "@/lib/company-context";
import { ClientForm } from "@/components/client-form";
import { NoCompany } from "@/components/no-company";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  const company = await getActiveCompany();
  if (!company) return <NoCompany title="Nuevo cliente" />;

  return (
    <>
      <PageHeader title="Nuevo cliente" subtitle={company.name} backHref="/clients" />
      <main className="page-shell form-shell py-4">
        <ClientForm
          companyDefaults={{
            currency: company.defaultCurrency,
            taxRate: company.defaultTaxRate,
            paymentTermsDays: company.defaultPaymentTermsDays,
          }}
        />
      </main>
    </>
  );
}
