import { getActiveCompany, listCompanies } from "@/lib/company-context";
import { listActiveClientsAcrossCompanies } from "@/lib/queries";
import { todayInTimeZone } from "@/lib/dates";
import { InvoiceForm } from "@/components/invoice-form";
import { NoCompany } from "@/components/no-company";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Nueva factura" };

export default async function NewInvoicePage(props: PageProps<"/invoices/new">) {
  const active = await getActiveCompany();
  if (!active) return <NoCompany title="Nueva factura" />;

  const params = await props.searchParams;
  const preselectedClientId = typeof params.client === "string" ? params.client : undefined;

  const companies = await listCompanies();
  const clients = await listActiveClientsAcrossCompanies();
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  return (
    <>
      <PageHeader
        title="Nueva factura"
        subtitle={companies.length > 1 ? undefined : active.name}
        backHref="/invoices"
      />

      <main className="page-shell form-shell py-4">
        {clients.length === 0 ? (
          <EmptyState
            icon="users"
            title="Primero registra un cliente"
            description="Una factura necesita un cliente con sus datos fiscales."
            action={<LinkButton href="/clients/new">Nuevo cliente</LinkButton>}
          />
        ) : (
          <InvoiceForm
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
