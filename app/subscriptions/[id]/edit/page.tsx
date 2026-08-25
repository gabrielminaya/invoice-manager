import { notFound } from "next/navigation";
import { listCompanies } from "@/lib/company-context";
import { getSubscriptionDetail, listActiveClientsAcrossCompanies } from "@/lib/queries";
import { todayInTimeZone } from "@/lib/dates";
import { SubscriptionForm } from "@/components/subscription-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Editar recurrencia" };

export default async function EditSubscriptionPage(props: PageProps<"/subscriptions/[id]/edit">) {
  const { id } = await props.params;
  const detail = await getSubscriptionDetail(id);
  if (!detail) notFound();

  const companies = await listCompanies();
  const clients = await listActiveClientsAcrossCompanies();
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  return (
    <>
      <PageHeader
        title="Editar recurrencia"
        subtitle={detail.subscription.name}
        backHref={`/subscriptions/${id}`}
      />
      <main className="page-shell form-shell py-4">
        <SubscriptionForm
          subscription={detail.subscription}
          initialLines={detail.items.map((item) => ({
            reference: item.reference,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
          }))}
          companies={companies.map((company) => ({
            id: company.id,
            name: company.name,
            defaultCurrency: company.defaultCurrency,
            defaultTaxRate: company.defaultTaxRate,
            defaultPaymentTermsDays: company.defaultPaymentTermsDays,
            defaultPaymentMethod: company.defaultPaymentMethod,
          }))}
          clients={clients}
          activeCompanyId={detail.subscription.companyId}
          today={today}
        />
      </main>
    </>
  );
}
