import { notFound } from "next/navigation";
import { getInvoiceDetail } from "@/lib/queries";
import { formatDateDO, relativeDayLabel, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  deleteDraftInvoice,
  issueInvoice,
  markInvoicePaid,
  reopenInvoice,
  voidInvoice,
} from "@/lib/actions/invoices";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icons";
import { Card, DataRow, InvoiceStatusBadge, LinkButton, PageHeader } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/invoices/[id]">) {
  const { id } = await props.params;
  const detail = await getInvoiceDetail(id);
  return { title: detail ? `Factura ${detail.invoice.number}` : "Factura" };
}

export default async function InvoicePage(props: PageProps<"/invoices/[id]">) {
  const { id } = await props.params;
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();

  const { invoice } = detail;
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");
  const pending = invoice.total - invoice.amountPaid;
  const isDraft = invoice.status === "draft";
  const isVoid = invoice.status === "void";
  const isPaid = invoice.status === "paid";

  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={detail.client.name}
        backHref="/invoices"
        action={<InvoiceStatusBadge status={invoice.status} />}
      />

      <main className="page-shell py-4">
      {/*
        En escritorio el documento ocupa la columna ancha y el resumen, las
        acciones y los metadatos se agrupan a la derecha. La colocación es
        explícita por fila y columna para que el orden en móvil —resumen,
        acciones, documento, metadatos— no cambie.
      */}
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4 lg:col-start-2 lg:row-start-1">
        {/* Resumen de cobro */}
        <Card className="no-print px-4 py-3.5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">
                {isPaid ? "Cobrado" : "Pendiente de cobro"}
              </p>
              <p
                className={`tabular text-2xl font-semibold leading-tight ${
                  isPaid ? "text-success" : invoice.status === "overdue" ? "text-danger" : "text-ink"
                }`}
              >
                {formatMoney(isPaid ? invoice.total : pending, invoice.currency)}
              </p>
            </div>
            <div className="text-right text-[0.8125rem] text-muted">
              <p>Vence {formatDateDO(invoice.dueDate)}</p>
              {!isPaid && !isVoid ? (
                <p className={invoice.status === "overdue" ? "font-medium text-danger" : ""}>
                  {relativeDayLabel(invoice.dueDate, today)}
                </p>
              ) : null}
            </div>
          </div>

          {invoice.subscriptionId ? (
            <LinkButton
              href={`/subscriptions/${invoice.subscriptionId}`}
              variant="ghost"
              className="mt-2 -ml-2 px-2 text-[0.8125rem]"
            >
              <Icon name="repeat" size={15} />
              Generada por una recurrencia
              <Icon name="chevronRight" size={14} />
            </LinkButton>
          ) : null}
        </Card>

        {/* Acciones */}
        <div className="no-print grid grid-cols-2 gap-2 lg:grid-cols-1">
          <PrintButton />

          {isDraft ? (
            <form action={issueInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <SubmitButton className="w-full" pendingLabel="Emitiendo…">
                <Icon name="check" size={18} />
                Emitir
              </SubmitButton>
            </form>
          ) : null}

          {!isPaid && !isVoid ? (
            <form action={markInvoicePaid}>
              <input type="hidden" name="id" value={invoice.id} />
              <SubmitButton variant="success" className="w-full" pendingLabel="Registrando…">
                <Icon name="wallet" size={18} />
                Marcar pagada
              </SubmitButton>
            </form>
          ) : null}

          {isPaid ? (
            <form action={reopenInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <SubmitButton variant="secondary" className="w-full" confirm="¿Reabrir esta factura cobrada?">
                Reabrir cobro
              </SubmitButton>
            </form>
          ) : null}

          {isDraft ? (
            <form action={deleteDraftInvoice} className="col-span-2 lg:col-span-1">
              <input type="hidden" name="id" value={invoice.id} />
              <SubmitButton
                variant="danger"
                className="w-full"
                confirm="¿Borrar este borrador? No se puede deshacer."
              >
                <Icon name="trash" size={17} />
                Borrar borrador
              </SubmitButton>
            </form>
          ) : null}

          {!isDraft && !isVoid ? (
            <form action={voidInvoice} className="col-span-2 lg:col-span-1">
              <input type="hidden" name="id" value={invoice.id} />
              <SubmitButton
                variant="danger"
                className="w-full"
                confirm="¿Anular esta factura? El número seguirá reservado para no dejar huecos en la serie."
              >
                Anular factura
              </SubmitButton>
            </form>
          ) : null}
        </div>

        </div>

        {/* El documento imprimible */}
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <InvoiceDocument detail={detail} />
        </div>

        {/* Metadatos */}
        <Card className="no-print lg:col-start-2 lg:row-start-2">
          <dl className="divide-y divide-line">
            <DataRow label="Estado" value={<InvoiceStatusBadge status={invoice.status} />} />
            <DataRow label="Serie / número" value={`${invoice.series} / ${invoice.seriesNumber}`} mono />
            <DataRow label="Emisión" value={formatDateDO(invoice.issueDate)} mono />
            <DataRow label="Vencimiento" value={formatDateDO(invoice.dueDate)} mono />
            <DataRow label="Forma de pago" value={invoice.paymentMethod ?? "—"} />
            {invoice.periodStart && invoice.periodEnd ? (
              <DataRow
                label="Período facturado"
                value={`${formatDateDO(invoice.periodStart)} – ${formatDateDO(invoice.periodEnd)}`}
                mono
              />
            ) : null}
            <DataRow label="Neto" value={formatMoney(invoice.subtotal, invoice.currency)} mono />
            <DataRow label="ITBIS" value={formatMoney(invoice.taxTotal, invoice.currency)} mono />
            <DataRow label="Total" value={formatMoney(invoice.total, invoice.currency)} mono />
            <DataRow label="Cobrado" value={formatMoney(invoice.amountPaid, invoice.currency)} mono />
            <DataRow
              label="Origen"
              value={invoice.generatedByCron ? "Cronjob de recurrencia" : "Creada a mano"}
            />
          </dl>
        </Card>
      </div>
    </main>
    </>
  );
}
