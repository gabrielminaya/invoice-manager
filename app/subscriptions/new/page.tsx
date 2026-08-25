import { getActiveCompany, listCompanies } from "@/lib/company-context";
import { listActiveClientsAcrossCompanies } from "@/lib/queries";
import { todayInTimeZone } from "@/lib/dates";
import { SubscriptionForm } from "@/components/subscription-form";
import { NoCompany } from "@/components/no-company";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Nueva recurrencia" };

export default async function NewSubscriptionPage(props: PageProps<"/subscriptions/new">) {
  const active = await getActiveCompany();
  if (!active) return <NoCompany title="Nueva recurrencia" />;

  const params = await props.searchParams;
  const preselectedClientId = typeof params.client === "string" ? params.client : undefined;

  const companies = await listCompanies();
  const clients = await listActiveClientsAcrossCompanies();
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  return (
    <>
      <PageHeader
        title="Nueva recurrencia"
        subtitle={companies.length > 1 ? undefined : active.name}
        backHref="/subscriptions"
      />

      <main className="page-shell form-shell py-4">
        {clients.length === 0 ? (
          <EmptyState
            icon="users"
            title="Primero registra un cliente"
            description="Una recurrencia factura siempre a un cliente concreto."
            action={<LinkButton href="/clients/new">Nuevo cliente</LinkButton>}
          />
        ) : (
          <SubscriptionForm
            companies={companies.map((company) => ({
              id: company.id,
              name: company.name,
              defaultCurrency: company.defaultCurrency,
              defaultTaxRate: company.defaultTaxRate,
              defaultPaymentTermsDays: company.defaultPaymentTermsDays,
              defaultPaymentMethod: company.defaultPaymentMethod,
            }))}
            clients={clients}
            activeCompanyId={active.id}
            today={today}
            preselectedClientId={preselectedClientId}
          />
        )}
      </main>
    </>
  );
}
