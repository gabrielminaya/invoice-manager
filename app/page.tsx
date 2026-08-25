import Link from "next/link";
import { getActiveCompany, listCompanies } from "@/lib/company-context";
import { getDashboardSummary } from "@/lib/queries";
import { todayInTimeZone, formatDateDO, relativeDayLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { intervalLabel } from "@/lib/recurrence";
import { CompanySwitcher } from "@/components/company-switcher";
import { Icon, type IconName } from "@/components/icons";
import { NoCompany } from "@/components/no-company";
import {
  Card,
  Divided,
  EmptyState,
  InvoiceStatusBadge,
  LinkButton,
  ListRow,
  PageHeader,
  SectionTitle,
} from "@/components/ui";

export const metadata = { title: "Panel" };

export default async function DashboardPage() {
  const company = await getActiveCompany();
  if (!company) return <NoCompany />;

  const companies = await listCompanies();
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");
  const summary = await getDashboardSummary(company.id, today);
  const currency = company.defaultCurrency;

  return (
    <>
      <PageHeader
        title={company.name}
        subtitle={`Serie ${company.invoiceSeries} · ${formatDateDO(today)}`}
        action={<CompanySwitcher companies={companies} activeId={company.id} />}
      />

      <main className="space-y-6 page-shell py-5">
        {/* Indicadores */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon="wallet"
            label="Por cobrar"
            value={formatMoney(summary.outstanding, currency)}
            tone="accent"
            href="/invoices?filter=unpaid"
          />
          <Stat
            icon="alert"
            label="Vencido"
            value={formatMoney(summary.overdue, currency)}
            tone={summary.overdue > 0 ? "danger" : "neutral"}
            hint={summary.overdueNow > 0 ? `${summary.overdueNow} factura(s)` : "Nada en mora"}
            href="/invoices?filter=overdue"
          />
          <Stat
            icon="check"
            label="Cobrado este mes"
            value={formatMoney(summary.paidThisMonth, currency)}
            tone="success"
            href="/invoices?filter=paid"
          />
          <Stat
            icon="repeat"
            label="Recurrencias activas"
            value={String(summary.activeSubscriptions)}
            hint={`${summary.clientCount} cliente(s)`}
            href="/subscriptions"
          />
        </section>

        {/* Acciones rápidas */}
        <section className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
          {/* En pantallas anchas los botones se ajustan al texto: estirarlos a
              todo lo ancho haría que el objetivo de clic fuese absurdo. */}
          <LinkButton href="/invoices/new" className="w-full sm:w-auto">
            <Icon name="plus" size={18} />
            Nueva factura
          </LinkButton>
          <LinkButton href="/subscriptions/new" variant="secondary" className="w-full sm:w-auto">
            <Icon name="repeat" size={18} />
            Nueva recurrencia
          </LinkButton>
        </section>

        {/* Las dos listas caben en paralelo desde lg. */}
        <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximas emisiones automáticas */}
        <section>
          <SectionTitle
            action={
              <Link href="/subscriptions" className="text-[0.8125rem] font-medium text-accent-text">
                Ver todas
              </Link>
            }
          >
            Próximas emisiones
          </SectionTitle>

          {summary.dueSoon.length === 0 ? (
            <Card className="px-4 py-5">
              <p className="text-sm text-muted">
                Ninguna recurrencia vence en los próximos 7 días.
              </p>
            </Card>
          ) : (
            <Card>
              <Divided>
                {summary.dueSoon.map((sub) => {
                  const late = sub.nextRunDate < today;
                  return (
                    <ListRow key={sub.id} href={`/subscriptions/${sub.id}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium text-ink">{sub.clientName}</p>
                        <p className="tabular shrink-0 text-[0.9375rem] font-semibold text-ink">
                          {formatMoney(sub.cycleTotal, sub.currency)}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-muted">
                        <Icon
                          name={late ? "alert" : "clock"}
                          size={13}
                          className={late ? "text-danger" : ""}
                        />
                        <span className={late ? "font-medium text-danger" : ""}>
                          {late ? "Pendiente desde" : "Emite"}{" "}
                          {relativeDayLabel(sub.nextRunDate, today)}
                        </span>
                        <span className="text-faint">·</span>
                        <span className="truncate">
                          {intervalLabel(sub.interval, sub.intervalCount)}
                        </span>
                      </div>
                    </ListRow>
                  );
                })}
              </Divided>
            </Card>
          )}
        </section>

        {/* Últimas facturas */}
        <section>
          <SectionTitle
            action={
              <Link href="/invoices" className="text-[0.8125rem] font-medium text-accent-text">
                Ver todas
              </Link>
            }
          >
            Últimas facturas
          </SectionTitle>

          {summary.recent.length === 0 ? (
            <EmptyState
              icon="invoice"
              title="Aún no hay facturas"
              description="Crea una factura puntual o deja que el cronjob emita la primera recurrencia."
              action={<LinkButton href="/invoices/new">Nueva factura</LinkButton>}
            />
          ) : (
            <Card>
              <Divided>
                {summary.recent.map((invoice) => (
                  <ListRow key={invoice.id} href={`/invoices/${invoice.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium text-ink">{invoice.clientName}</p>
                      <p className="tabular shrink-0 text-[0.9375rem] font-semibold text-ink">
                        {formatMoney(invoice.total, invoice.currency)}
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[0.8125rem] text-muted">
                      <span className="tabular">{invoice.number}</span>
                      <span className="text-faint">·</span>
                      <span>{formatDateDO(invoice.issueDate)}</span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                  </ListRow>
                ))}
              </Divided>
            </Card>
          )}
        </section>

        </div>

        {/* Estado del cronjob */}
        <section>
          <SectionTitle>Automatización</SectionTitle>
          <Card className="px-4 py-3.5">
            {summary.lastCronRun ? (
              <div className="space-y-1">
                <p className="text-[0.9375rem] text-ink">
                  Última corrida del cron:{" "}
                  <span className="font-medium">
                    {summary.lastCronRun.createdCount} factura(s) emitida(s)
                  </span>
                  {summary.lastCronRun.dryRun ? " (simulación)" : ""}
                </p>
                <p className="text-[0.8125rem] text-muted">
                  {summary.lastCronRun.startedAt.toLocaleString("es-DO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {summary.lastCronRun.errorCount > 0
                    ? ` · ${summary.lastCronRun.errorCount} error(es)`
                    : ""}
                </p>
              </div>
            ) : (
              <p className="text-[0.9375rem] text-muted">
                El cronjob todavía no se ha ejecutado.
              </p>
            )}
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-accent-text"
            >
              Configurar el cronjob
              <Icon name="chevronRight" size={14} />
            </Link>
          </Card>
        </section>
      </main>
    </>
  );
}

const TONES = {
  neutral: "text-ink",
  accent: "text-accent-text",
  success: "text-success",
  danger: "text-danger",
} as const;

function Stat({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof TONES;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-card border border-line bg-surface p-3.5 shadow-card transition-colors hover:bg-surface-2"
    >
      <div className="flex items-center gap-1.5 text-faint">
        <Icon name={icon} size={14} />
        <span className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className={`tabular mt-1.5 text-lg font-semibold leading-tight ${TONES[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted">{hint}</p> : null}
    </Link>
  );
}
