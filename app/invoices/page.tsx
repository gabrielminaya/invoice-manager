import { getActiveCompany } from "@/lib/company-context";
import { listInvoices, type InvoiceFilter } from "@/lib/queries";
import { formatDateDO, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { FilterChips, SearchForm } from "@/components/search-form";
import { Icon } from "@/components/icons";
import { NoCompany } from "@/components/no-company";
import {
  Card,
  Cell,
  Divided,
  EmptyState,
  InvoiceStatusBadge,
  LinkButton,
  PageHeader,
  TableHead,
  TableRow,
} from "@/components/ui";

export const metadata = { title: "Facturas" };

const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "unpaid", label: "Por cobrar" },
  { value: "overdue", label: "Vencidas" },
  { value: "draft", label: "Borradores" },
  { value: "paid", label: "Pagadas" },
  { value: "void", label: "Anuladas" },
];

/** Anchos de columna del listado en escritorio. */
const INVOICE_COLUMNS = "8rem minmax(0,1fr) 6.5rem 6.5rem 6.5rem 9rem";

const isFilter = (value: string): value is InvoiceFilter =>
  FILTERS.some((f) => f.value === value);

export default async function InvoicesPage(props: PageProps<"/invoices">) {
  const company = await getActiveCompany();
  if (!company) return <NoCompany title="Facturas" />;

  const params = await props.searchParams;
  const rawFilter = typeof params.filter === "string" ? params.filter : "all";
  const filter: InvoiceFilter = isFilter(rawFilter) ? rawFilter : "all";
  const search = typeof params.q === "string" ? params.q : "";

  const invoices = await listInvoices(company.id, { filter, search });
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  return (
    <>
      <PageHeader
        title="Facturas"
        subtitle={`${invoices.length} documento(s)`}
        action={
          <LinkButton href="/invoices/new" className="px-3" aria-label="Nueva factura">
            <Icon name="plus" size={18} />
            <span className="sr-only sm:not-sr-only">Nueva</span>
          </LinkButton>
        }
      />

      <main className="space-y-4 page-shell py-4">
        <SearchForm
          action="/invoices"
          placeholder="Buscar por número o cliente"
          defaultValue={search}
          hidden={{ filter: filter === "all" ? undefined : filter }}
        />

        <FilterChips
          options={FILTERS}
          active={filter}
          hrefFor={(value) => {
            const query = new URLSearchParams();
            if (value !== "all") query.set("filter", value);
            if (search) query.set("q", search);
            const qs = query.toString();
            return qs ? `/invoices?${qs}` : "/invoices";
          }}
        />

        {invoices.length === 0 ? (
          <EmptyState
            icon="invoice"
            title="Sin resultados"
            description={
              search
                ? `Ninguna factura coincide con "${search}".`
                : "No hay facturas con este filtro."
            }
            action={<LinkButton href="/invoices/new">Nueva factura</LinkButton>}
          />
        ) : (
          <Card>
            <TableHead columns={INVOICE_COLUMNS}>
              <Cell>Número</Cell>
              <Cell>Cliente</Cell>
              <Cell>Emisión</Cell>
              <Cell>Vencimiento</Cell>
              <Cell>Estado</Cell>
              <Cell align="right">Total</Cell>
            </TableHead>

            <Divided>
              {invoices.map((invoice) => {
                const pending = invoice.total - invoice.amountPaid;
                const late = invoice.status === "overdue";

                return (
                  <TableRow
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    columns={INVOICE_COLUMNS}
                    mobile={
                      <>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium text-ink">{invoice.clientName}</p>
                          <p className="tabular shrink-0 font-semibold text-ink">
                            {formatMoney(invoice.total, invoice.currency)}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
                          <span className="tabular font-medium">{invoice.number}</span>
                          <InvoiceStatusBadge status={invoice.status} />
                          <span className="text-faint">{formatDateDO(invoice.issueDate)}</span>
                          {invoice.generatedByCron ? (
                            <span
                              title="Emitida automáticamente por el cronjob"
                              className="inline-flex items-center gap-0.5 text-faint"
                            >
                              <Icon name="bolt" size={12} />
                              auto
                            </span>
                          ) : null}
                          {late ? (
                            <span className="font-medium text-danger">
                              vence {formatDateDO(invoice.dueDate)}
                            </span>
                          ) : null}
                          {pending > 0 && invoice.amountPaid > 0 ? (
                            <span className="tabular text-warning">
                              pendiente {formatMoney(pending, invoice.currency)}
                            </span>
                          ) : null}
                        </div>
                      </>
                    }
                    desktop={
                      <>
                        <Cell className="tabular font-medium text-ink">
                          <span className="inline-flex items-center gap-1.5">
                            {invoice.number}
                            {invoice.generatedByCron ? (
                              <Icon
                                name="bolt"
                                size={12}
                                className="shrink-0 text-faint"
                                aria-label="Emitida por el cronjob"
                              />
                            ) : null}
                          </span>
                        </Cell>
                        <Cell className="text-ink">{invoice.clientName}</Cell>
                        <Cell className="tabular text-[0.875rem] text-muted">
                          {formatDateDO(invoice.issueDate)}
                        </Cell>
                        <Cell
                          className={`tabular text-[0.875rem] ${
                            late ? "font-medium text-danger" : "text-muted"
                          }`}
                        >
                          {formatDateDO(invoice.dueDate)}
                        </Cell>
                        <Cell>
                          <InvoiceStatusBadge status={invoice.status} />
                        </Cell>
                        <Cell align="right" className="tabular font-semibold text-ink">
                          {formatMoney(invoice.total, invoice.currency)}
                          {pending > 0 && invoice.amountPaid > 0 ? (
                            <span className="block text-xs font-normal text-warning">
                              pendiente {formatMoney(pending, invoice.currency)}
                            </span>
                          ) : null}
                        </Cell>
                      </>
                    }
                  />
                );
              })}
            </Divided>
          </Card>
        )}

        <p className="px-1 text-center text-xs text-faint">
          Al {formatDateDO(today)} · las facturas vencidas se marcan en cada corrida del cron
        </p>
      </main>
    </>
  );
}
