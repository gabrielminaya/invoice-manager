import { notFound } from "next/navigation";
import { getActiveCompany } from "@/lib/company-context";
import { getClient } from "@/lib/queries";
import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Editar cliente" };

export default async function EditClientPage(props: PageProps<"/clients/[id]/edit">) {
  const { id } = await props.params;
  const client = await getClient(id);
  if (!client) notFound();

  const company = await getActiveCompany();

  return (
    <>
      <PageHeader
        title="Editar cliente"
        subtitle={client.name}
        backHref={`/clients/${client.id}`}
      />
      <main className="page-shell form-shell py-4">
        <ClientForm
          client={client}
          companyDefaults={{
            currency: company?.defaultCurrency ?? "DOP",
            taxRate: company?.defaultTaxRate ?? 0,
            paymentTermsDays: company?.defaultPaymentTermsDays ?? 0,
          }}
        />
      </main>
    </>
  );
}
