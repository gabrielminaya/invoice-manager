import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveCompany } from "@/lib/company-context";
import { getClient, getInvoicesByClient, listSubscriptions } from "@/lib/queries";
import { formatDateDO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { intervalLabel } from "@/lib/recurrence";
import { toggleClientActive } from "@/lib/actions/clients";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icons";
import {
  Card,
  DataRow,
  Divided,
  InvoiceStatusBadge,
  LinkButton,
  ListRow,
  PageHeader,
  SectionTitle,
  SubscriptionStatusBadge,
} from "@/components/ui";

export async function generateMetadata(props: PageProps<"/clients/[id]">) {
  const { id } = await props.params;
  const client = await getClient(id);
  return { title: client?.name ?? "Cliente" };
}

export default async function ClientPage(props: PageProps<"/clients/[id]">) {
  const { id } = await props.params;
  const client = await getClient(id);
  if (!client) notFound();

  const company = await getActiveCompany();
  const invoices = await getInvoicesByClient(id, 10);
  const allSubscriptions = await listSubscriptions(client.companyId, "all");
  const subscriptions = allSubscriptions.filter((sub) => sub.clientId === id);

  const currency = client.currency ?? company?.defaultCurrency ?? "DOP";
  const outstanding = invoices
    .filter((invoice) => invoice.status === "issued" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + invoice.total - invoice.amountPaid, 0);

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={client.rnc ? `RNC ${client.rnc}` : undefined}
        backHref="/clients"
        action={
          <LinkButton href={`/clients/${client.id}/edit`} variant="ghost" className="px-3">
            Editar
          </LinkButton>
        }
      />

      <main className="page-shell py-4">
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-5 lg:col-start-2 lg:row-start-1">
        <Card className="px-4 py-3.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">
            Saldo por cobrar
          </p>
          <p className="tabular text-2xl font-semibold leading-tight text-ink">
            {formatMoney(outstanding, currency)}
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <LinkButton href={`/invoices/new?client=${client.id}`} className="w-full">
            <Icon name="plus" size={18} />
            Factura
          </LinkButton>
          <LinkButton
            href={`/subscriptions/new?client=${client.id}`}
            variant="secondary"
            className="w-full"
          >
            <Icon name="repeat" size={18} />
            Recurrencia
          </LinkButton>
        </div>

        </div>

        <div className="space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <section>
          <SectionTitle>Datos</SectionTitle>
          <Card>
            <dl className="divide-y divide-line">
              <DataRow label="Dirección" value={client.addressLine ?? "—"} />
              <DataRow
                label="Ciudad / país"
                value={[client.city, client.country].filter(Boolean).join(", ") || "—"}
              />
              <DataRow label="Correo" value={client.email ?? "—"} />
              <DataRow label="Correos en copia" value={client.emailCc ?? "—"} />
              <DataRow label="Teléfono" value={client.phone ?? "—"} />
              <DataRow
                label="Divisa"
                value={client.currency ?? `Hereda (${company?.defaultCurrency ?? "—"})`}
              />
              <DataRow
                label="Días de crédito"
                value={
                  client.paymentTermsDays != null
                    ? String(client.paymentTermsDays)
                    : `Hereda (${company?.defaultPaymentTermsDays ?? 0})`
                }
                mono
              />
              <DataRow
                label="ITBIS"
                value={
                  client.taxRate != null
                    ? `${client.taxRate} %`
                    : `Hereda (${company?.defaultTaxRate ?? 0} %)`
                }
                mono
              />
            </dl>
          </Card>
          {client.notes ? (
            <p className="mt-2 whitespace-pre-line px-1 text-[0.8125rem] text-muted">
              {client.notes}
            </p>
          ) : null}
        </section>

        <section>
          <SectionTitle>Recurrencias</SectionTitle>
          {subscriptions.length === 0 ? (
            <Card className="px-4 py-4">
              <p className="text-sm text-muted">Este cliente no tiene facturación recurrente.</p>
            </Card>
          ) : (
            <Card>
              <Divided>
                {subscriptions.map((sub) => (
                  <ListRow key={sub.id} href={`/subscriptions/${sub.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium text-ink">{sub.name}</p>
                      <p className="tabular shrink-0 font-semibold text-ink">
                        {formatMoney(sub.cycleTotal, sub.currency)}
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[0.8125rem] text-muted">
                      <SubscriptionStatusBadge status={sub.status} />
                      <span>{intervalLabel(sub.interval, sub.intervalCount)}</span>
                      <span className="text-faint">·</span>
                      <span>próxima {formatDateDO(sub.nextRunDate)}</span>
                    </div>
                  </ListRow>
                ))}
              </Divided>
            </Card>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              <Link
                href={`/invoices?q=${encodeURIComponent(client.name)}`}
                className="text-[0.8125rem] font-medium text-accent-text"
              >
                Ver todas
              </Link>
            }
          >
            Facturas
          </SectionTitle>
          {invoices.length === 0 ? (
            <Card className="px-4 py-4">
              <p className="text-sm text-muted">Todavía no le has facturado.</p>
            </Card>
          ) : (
            <Card>
              <Divided>
                {invoices.map((invoice) => (
                  <ListRow key={invoice.id} href={`/invoices/${invoice.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="tabular truncate font-medium text-ink">{invoice.number}</p>
                      <p className="tabular shrink-0 font-semibold text-ink">
                        {formatMoney(invoice.total, invoice.currency)}
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[0.8125rem] text-muted">
                      <InvoiceStatusBadge status={invoice.status} />
                      <span>{formatDateDO(invoice.issueDate)}</span>
                    </div>
                  </ListRow>
                ))}
              </Divided>
            </Card>
          )}
        </section>

        </div>

        <form action={toggleClientActive} className="lg:col-start-2 lg:row-start-2">
          <input type="hidden" name="id" value={client.id} />
          <SubmitButton
            variant={client.active ? "danger" : "secondary"}
            className="w-full"
            confirm={
              client.active
                ? "¿Desactivar este cliente? Dejará de aparecer al crear facturas."
                : undefined
            }
          >
            {client.active ? "Desactivar cliente" : "Reactivar cliente"}
          </SubmitButton>
        </form>
      </div>
    </main>
    </>
  );
}
