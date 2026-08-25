import { getActiveCompany } from "@/lib/company-context";
import { listClients } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { SearchForm } from "@/components/search-form";
import { Icon } from "@/components/icons";
import { NoCompany } from "@/components/no-company";
import {
  Badge,
  Card,
  Cell,
  Divided,
  EmptyState,
  LinkButton,
  PageHeader,
  TableHead,
  TableRow,
} from "@/components/ui";

export const metadata = { title: "Clientes" };

/** Anchos de columna del listado en escritorio. */
const CLIENT_COLUMNS = "minmax(0,1.4fr) 10rem 10rem 9rem";

export default async function ClientsPage(props: PageProps<"/clients">) {
  const company = await getActiveCompany();
  if (!company) return <NoCompany title="Clientes" />;

  const params = await props.searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const clients = await listClients(company.id, search);

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} registrado(s)`}
        action={
          <LinkButton href="/clients/new" className="px-3" aria-label="Nuevo cliente">
            <Icon name="plus" size={18} />
            <span className="sr-only sm:not-sr-only">Nuevo</span>
          </LinkButton>
        }
      />

      <main className="space-y-4 page-shell py-4">
        <SearchForm action="/clients" placeholder="Buscar por nombre o RNC" defaultValue={search} />

        {clients.length === 0 ? (
          <EmptyState
            icon="users"
            title={search ? "Sin resultados" : "Aún no hay clientes"}
            description={
              search
                ? `Ningún cliente coincide con "${search}".`
                : "Registra a quién le facturas para poder emitir y automatizar sus cobros."
            }
            action={<LinkButton href="/clients/new">Nuevo cliente</LinkButton>}
          />
        ) : (
          <Card>
            <TableHead columns={CLIENT_COLUMNS}>
              <Cell>Cliente</Cell>
              <Cell>RNC</Cell>
              <Cell>Recurrencias</Cell>
              <Cell align="right">Por cobrar</Cell>
            </TableHead>

            <Divided>
              {clients.map((client) => (
                <TableRow
                  key={client.id}
                  href={`/clients/${client.id}`}
                  columns={CLIENT_COLUMNS}
                  mobile={
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium text-ink">{client.name}</p>
                        {client.outstanding > 0 ? (
                          <p className="tabular shrink-0 text-[0.9375rem] font-semibold text-accent-text">
                            {formatMoney(
                              client.outstanding,
                              client.currency ?? company.defaultCurrency,
                            )}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
                        {client.rnc ? <span className="tabular">RNC {client.rnc}</span> : null}
                        {client.subscriptionCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-accent-text">
                            <Icon name="repeat" size={12} />
                            {client.subscriptionCount} recurrencia(s)
                          </span>
                        ) : null}
                        {!client.active ? (
                          <Badge className="bg-surface-2 text-faint">Inactivo</Badge>
                        ) : null}
                      </div>
                    </>
                  }
                  desktop={
                    <>
                      <Cell className="font-medium text-ink">
                        <span className="inline-flex items-center gap-2">
                          {client.name}
                          {!client.active ? (
                            <Badge className="bg-surface-2 text-faint">Inactivo</Badge>
                          ) : null}
                        </span>
                      </Cell>
                      <Cell className="tabular text-[0.875rem] text-muted">
                        {client.rnc ?? "—"}
                      </Cell>
                      <Cell className="text-[0.875rem]">
                        {client.subscriptionCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-accent-text">
                            <Icon name="repeat" size={13} />
                            {client.subscriptionCount} activa(s)
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </Cell>
                      <Cell align="right" className="tabular font-semibold">
                        {client.outstanding > 0 ? (
                          <span className="text-accent-text">
                            {formatMoney(
                              client.outstanding,
                              client.currency ?? company.defaultCurrency,
                            )}
                          </span>
                        ) : (
                          <span className="font-normal text-faint">al día</span>
                        )}
                      </Cell>
                    </>
                  }
                />
              ))}
            </Divided>
          </Card>
        )}
      </main>
    </>
  );
}
