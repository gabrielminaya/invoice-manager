import { notFound } from "next/navigation";
import { getSubscriptionDetail } from "@/lib/queries";
import { formatDateDO, formatDateLong, relativeDayLabel, todayInTimeZone } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { advance, intervalLabel, periodLabel } from "@/lib/recurrence";
import { issueSubscriptionNow, setSubscriptionStatus } from "@/lib/actions/subscriptions";
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

export async function generateMetadata(props: PageProps<"/subscriptions/[id]">) {
  const { id } = await props.params;
  const detail = await getSubscriptionDetail(id);
  return { title: detail?.subscription.name ?? "Recurrencia" };
}

export default async function SubscriptionPage(props: PageProps<"/subscriptions/[id]">) {
  const { id } = await props.params;
  const detail = await getSubscriptionDetail(id);
  if (!detail) notFound();

  const { subscription: sub, client, items, generated } = detail;
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  const cycleTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (1 + item.taxRate / 100),
    0,
  );
  const isActive = sub.status === "active";
  const isDue = isActive && sub.nextRunDate <= today;
  const afterNext = advance(sub.nextRunDate, sub.interval, sub.intervalCount, sub.anchorDay);

  return (
    <>
      <PageHeader
        title={sub.name}
        subtitle={client.name}
        backHref="/subscriptions"
        action={
          <LinkButton href={`/subscriptions/${sub.id}/edit`} variant="ghost" className="px-3">
            Editar
          </LinkButton>
        }
      />

      <main className="page-shell py-4">
      {/* Colocación explícita por fila y columna: en escritorio el importe y las
          acciones quedan a la derecha, sin alterar el orden en móvil. */}
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-5 lg:col-start-2 lg:row-start-1">
        {/* Estado del ciclo */}
        <Card className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">
                Importe por ciclo
              </p>
              <p className="tabular text-2xl font-semibold leading-tight text-ink">
                {formatMoney(cycleTotal, sub.currency)}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {intervalLabel(sub.interval, sub.intervalCount)}
              </p>
            </div>
            <SubscriptionStatusBadge status={sub.status} />
          </div>

          {isActive ? (
            <div
              className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] ${
                isDue ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"
              }`}
            >
              <Icon name={isDue ? "bolt" : "clock"} size={16} className="shrink-0" />
              <span>
                {isDue ? (
                  <>
                    Vencida: el cronjob la emitirá en su próxima corrida
                    {sub.nextRunDate < today
                      ? ` (pendiente desde el ${formatDateDO(sub.nextRunDate)})`
                      : ""}
                  </>
                ) : (
                  <>
                    Próxima emisión {formatDateLong(sub.nextRunDate)} (
                    {relativeDayLabel(sub.nextRunDate, today)})
                  </>
                )}
              </span>
            </div>
          ) : null}
        </Card>

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {isActive ? (
            <>
              <form action={issueSubscriptionNow}>
                <input type="hidden" name="id" value={sub.id} />
                <SubmitButton className="w-full" pendingLabel="Emitiendo…">
                  <Icon name="bolt" size={18} />
                  Emitir ahora
                </SubmitButton>
              </form>
              <form action={setSubscriptionStatus}>
                <input type="hidden" name="id" value={sub.id} />
                <input type="hidden" name="status" value="paused" />
                <SubmitButton variant="secondary" className="w-full">
                  <Icon name="pause" size={18} />
                  Pausar
                </SubmitButton>
              </form>
            </>
          ) : null}

          {sub.status === "paused" ? (
            <form action={setSubscriptionStatus} className="col-span-2 lg:col-span-1">
              <input type="hidden" name="id" value={sub.id} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton className="w-full">
                <Icon name="play" size={18} />
                Reactivar
              </SubmitButton>
            </form>
          ) : null}

          {sub.status === "finished" || sub.status === "cancelled" ? (
            <form action={setSubscriptionStatus} className="col-span-2 lg:col-span-1">
              <input type="hidden" name="id" value={sub.id} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton variant="secondary" className="w-full">
                Reactivar recurrencia
              </SubmitButton>
            </form>
          ) : null}

          {sub.status !== "cancelled" ? (
            <form action={setSubscriptionStatus} className="col-span-2 lg:col-span-1">
              <input type="hidden" name="id" value={sub.id} />
              <input type="hidden" name="status" value="cancelled" />
              <SubmitButton
                variant="danger"
                className="w-full"
                confirm="¿Cancelar la recurrencia? No se emitirán más facturas; las ya emitidas se conservan."
              >
                Cancelar recurrencia
              </SubmitButton>
            </form>
          ) : null}
        </div>

        </div>

        <div className="space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {/* Conceptos */}
        <section>
          <SectionTitle>Conceptos de cada factura</SectionTitle>
          <Card>
            <Divided>
              {items.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-ink">
                      {item.reference ? `${item.reference} · ` : ""}
                      {item.description}
                    </p>
                    <p className="tabular shrink-0 font-semibold text-ink">
                      {formatAmount(item.quantity * item.unitPrice)}
                    </p>
                  </div>
                  <p className="tabular mt-0.5 text-[0.8125rem] text-muted">
                    {item.quantity} × {formatAmount(item.unitPrice)}
                    {item.taxRate > 0 ? ` · ITBIS ${item.taxRate}%` : " · exento"}
                  </p>
                </div>
              ))}
            </Divided>
          </Card>
        </section>

        {/* Calendario */}
        <section>
          <SectionTitle>Calendario</SectionTitle>
          <Card>
            <dl className="divide-y divide-line">
              <DataRow label="Frecuencia" value={intervalLabel(sub.interval, sub.intervalCount)} />
              <DataRow label="Primera emisión" value={formatDateDO(sub.startDate)} mono />
              <DataRow label="Próxima emisión" value={formatDateDO(sub.nextRunDate)} mono />
              {isActive ? (
                <DataRow label="Y después" value={formatDateDO(afterNext)} mono />
              ) : null}
              <DataRow
                label="Período del próximo ciclo"
                value={periodLabel(sub.nextRunDate, sub.interval, sub.intervalCount)}
              />
              <DataRow
                label="Última emitida"
                value={sub.lastRunDate ? formatDateDO(sub.lastRunDate) : "—"}
                mono
              />
              <DataRow label="Fin" value={sub.endDate ? formatDateDO(sub.endDate) : "Sin fin"} mono />
              <DataRow
                label="Facturas emitidas"
                value={
                  sub.maxOccurrences
                    ? `${sub.occurrences} de ${sub.maxOccurrences}`
                    : String(sub.occurrences)
                }
                mono
              />
              <DataRow
                label="Al emitir"
                value={sub.autoIssue ? "Factura emitida" : "Borrador para revisar"}
              />
              <DataRow label="Forma de pago" value={sub.paymentMethod ?? "—"} />
              <DataRow
                label="Días de crédito"
                value={sub.paymentTermsDays != null ? String(sub.paymentTermsDays) : "Hereda del cliente"}
                mono
              />
            </dl>
          </Card>
        </section>

        {/* Historial */}
        <section>
          <SectionTitle>Facturas generadas</SectionTitle>
          {generated.length === 0 ? (
            <Card className="px-4 py-4">
              <p className="text-sm text-muted">
                Todavía no ha generado facturas. La primera saldrá el{" "}
                {formatDateDO(sub.nextRunDate)}.
              </p>
            </Card>
          ) : (
            <Card>
              <Divided>
                {generated.map((invoice) => (
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
      </div>
    </main>
    </>
  );
}
