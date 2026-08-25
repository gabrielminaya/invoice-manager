import { getActiveCompany } from "@/lib/company-context";
import { listSubscriptions } from "@/lib/queries";
import { formatDateDO, relativeDayLabel, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { intervalLabel } from "@/lib/recurrence";
import { FilterChips } from "@/components/search-form";
import { Icon } from "@/components/icons";
import { NoCompany } from "@/components/no-company";
import {
  Card,
  Cell,
  Divided,
  EmptyState,
  LinkButton,
  PageHeader,
  SubscriptionStatusBadge,
  TableHead,
  TableRow,
} from "@/components/ui";

export const metadata = { title: "Recurrencias" };

const FILTERS = [
  { value: "active", label: "Activas" },
  { value: "paused", label: "Pausadas" },
  { value: "all", label: "Todas" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Anchos de columna del listado en escritorio. */
const SUBSCRIPTION_COLUMNS = "minmax(0,1.1fr) minmax(0,1fr) 7.5rem 8.5rem 7rem 9rem";

const isFilter = (value: string): value is Filter =>
  FILTERS.some((option) => option.value === value);

export default async function SubscriptionsPage(props: PageProps<"/subscriptions">) {
  const company = await getActiveCompany();
  if (!company) return <NoCompany title="Recurrencias" />;

  const params = await props.searchParams;
  const raw = typeof params.filter === "string" ? params.filter : "active";
  const filter: Filter = isFilter(raw) ? raw : "active";

  const subscriptions = await listSubscriptions(company.id, filter);
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  return (
    <>
      <PageHeader
        title="Recurrencias"
        subtitle={`${subscriptions.length} contrato(s)`}
        action={
          <LinkButton href="/subscriptions/new" className="px-3" aria-label="Nueva recurrencia">
            <Icon name="plus" size={18} />
            <span className="sr-only sm:not-sr-only">Nueva</span>
          </LinkButton>
        }
      />

      <main className="space-y-4 page-shell py-4">
        <FilterChips
          options={[...FILTERS]}
          active={filter}
          hrefFor={(value) =>
            value === "active" ? "/subscriptions" : `/subscriptions?filter=${value}`
          }
        />

        {subscriptions.length === 0 ? (
          <EmptyState
            icon="repeat"
            title="Sin recurrencias"
            description="Define un contrato periódico y el cronjob emitirá sus facturas sin que tengas que entrar."
            action={<LinkButton href="/subscriptions/new">Nueva recurrencia</LinkButton>}
          />
        ) : (
          <Card>
            <TableHead columns={SUBSCRIPTION_COLUMNS}>
              <Cell>Cliente</Cell>
              <Cell>Contrato</Cell>
              <Cell>Frecuencia</Cell>
              <Cell>Próxima emisión</Cell>
              <Cell>Estado</Cell>
              <Cell align="right">Por ciclo</Cell>
            </TableHead>

            <Divided>
              {subscriptions.map((sub) => {
                const late = sub.status === "active" && sub.nextRunDate <= today;

                return (
                  <TableRow
                    key={sub.id}
                    href={`/subscriptions/${sub.id}`}
                    columns={SUBSCRIPTION_COLUMNS}
                    mobile={
                      <>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium text-ink">{sub.clientName}</p>
                          <p className="tabular shrink-0 font-semibold text-ink">
                            {formatMoney(sub.cycleTotal, sub.currency)}
                          </p>
                        </div>
                        <p className="mt-0.5 truncate text-[0.8125rem] text-muted">{sub.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
                          <SubscriptionStatusBadge status={sub.status} />
                          <span className="text-muted">
                            {intervalLabel(sub.interval, sub.intervalCount)}
                          </span>
                          {sub.status === "active" ? (
                            <span className={late ? "font-medium text-danger" : "text-muted"}>
                              {late
                                ? "pendiente de emitir"
                                : `emite ${relativeDayLabel(sub.nextRunDate, today)}`}
                            </span>
                          ) : null}
                          {!sub.autoIssue ? (
                            <span className="text-faint">genera borrador</span>
                          ) : null}
                        </div>
                      </>
                    }
                    desktop={
                      <>
                        <Cell className="font-medium text-ink">{sub.clientName}</Cell>
                        <Cell className="text-[0.875rem] text-muted">
                          {sub.name}
                          {!sub.autoIssue ? (
                            <span className="block text-xs text-faint">genera borrador</span>
                          ) : null}
                        </Cell>
                        <Cell className="text-[0.875rem] text-muted">
                          {intervalLabel(sub.interval, sub.intervalCount)}
                        </Cell>
                        <Cell
                          className={`tabular text-[0.875rem] ${
                            late ? "font-medium text-danger" : "text-muted"
                          }`}
                        >
                          {sub.status === "active" ? (
                            <>
                              {formatDateDO(sub.nextRunDate)}
                              <span className="block text-xs font-normal">
                                {late ? "pendiente" : relativeDayLabel(sub.nextRunDate, today)}
                              </span>
                            </>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </Cell>
                        <Cell>
                          <SubscriptionStatusBadge status={sub.status} />
                        </Cell>
                        <Cell align="right" className="tabular font-semibold text-ink">
                          {formatMoney(sub.cycleTotal, sub.currency)}
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
          Al {formatDateDO(today)} · el cronjob emite todo lo vencido hasta hoy
        </p>
      </main>
    </>
  );
}
