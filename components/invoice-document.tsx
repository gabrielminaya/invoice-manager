import Image from "next/image";
import type { InvoiceDetail } from "@/lib/queries";
import { formatDateDO } from "@/lib/dates";
import { CURRENCY_LABEL, formatAmount } from "@/lib/money";

/**
 * Documento de la factura, calcado de la factura de referencia FAC0010A7.
 *
 * Se muestra tal cual en pantalla y es lo único que sobrevive al imprimir
 * (ver la regla `.print-document` en globals.css), así que "Guardar como PDF"
 * del navegador produce el documento definitivo.
 *
 * Los datos salen de la copia congelada en la factura cuando existe: una
 * factura ya emitida no debe cambiar porque el cliente se haya mudado.
 */
export function InvoiceDocument({ detail }: { detail: InvoiceDetail }) {
  const { invoice, items, receipts } = detail;

  const company = {
    ...withSnapshot(detail.company, invoice.companySnapshot),
    // El logo se toma siempre del registro vivo, no de la copia: es marca, no
    // dato fiscal, y así las facturas antiguas también salen con el logo actual.
    logoUrl: detail.company.logoUrl,
  };
  const client = withSnapshot(detail.client, invoice.clientSnapshot);

  const cityLine = [
    [company.postalCode, company.city].filter(Boolean).join(" "),
    company.region ? `(${company.region})` : null,
    company.country,
  ]
    .filter(Boolean)
    .join(" ");

  const contactLine = [company.phone, company.email].filter(Boolean).join(" · ");
  const clientAddress = [client.addressLine, client.city, client.country]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="print-document rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
      {/* Cabecera: logo a la izquierda, emisor a la derecha */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Sin logo no se pinta nada aquí: el bloque de la derecha ya lleva el
            nombre del emisor y repetirlo lo duplicaría en pantallas estrechas. */}
        {company.logoUrl ? (
          <Image
            src={company.logoUrl}
            alt={company.name ?? "Logo"}
            width={180}
            height={48}
            className="h-12 w-auto object-contain object-left"
            unoptimized
          />
        ) : null}

        {/* ms-auto empuja el bloque al margen derecho aunque no haya logo: con
            justify-between y un solo hijo, el navegador lo alinearía a la
            izquierda. */}
        <div className="text-left text-[0.6875rem] leading-snug text-muted sm:ms-auto sm:text-right">
          <p className="text-lg font-semibold leading-tight text-ink">{company.name}</p>
          {company.addressLine ? <p>- {company.addressLine}</p> : null}
          {cityLine ? <p>{cityLine}</p> : null}
          {contactLine ? <p className="mt-1.5">{contactLine}</p> : null}
        </div>
      </header>

      {/* Título del documento */}
      <h2 className="mt-8 border-b border-line pb-2 text-xl font-medium text-ink">
        Factura: <span className="font-semibold">{invoice.number}</span>
      </h2>

      {/* Datos del cliente y del documento */}
      <div className="mt-3 grid gap-x-6 gap-y-1 text-[0.8125rem] leading-relaxed text-ink sm:grid-cols-[1fr_auto]">
        <dl className="space-y-0.5">
          <div>
            <span className="text-muted">Cliente: </span>
            {client.name}
          </div>
          {clientAddress ? (
            <div>
              <span className="text-muted">Dirección: </span>
              {clientAddress}
            </div>
          ) : null}
          {client.rnc ? (
            <div>
              <span className="text-muted">RNC: </span>
              {client.rnc}
            </div>
          ) : null}
        </dl>

        <dl className="space-y-0.5 sm:text-right">
          <div>
            <span className="text-muted">Fecha: </span>
            {formatDateDO(invoice.issueDate)}
          </div>
          <div>
            <span className="text-muted">Serie: </span>
            {invoice.series}
          </div>
          <div>
            <span className="text-muted">Número: </span>
            {invoice.seriesNumber}
          </div>
        </dl>
      </div>

      {/* Conceptos */}
      <div className="mt-6 -mx-1 overflow-x-auto px-1">
        <table className="print-table w-full min-w-[26rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="text-muted">
              <th className="border border-line px-2.5 py-1.5 text-left font-normal">
                Referencia - Descripción
              </th>
              <th className="border border-line px-2.5 py-1.5 text-right font-normal">Cantidad</th>
              <th className="border border-line px-2.5 py-1.5 text-right font-normal">Precio</th>
              <th className="border border-line px-2.5 py-1.5 text-right font-normal">Neto</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="text-ink">
                <td className="border border-line px-2.5 py-1.5">
                  {item.reference ? `${item.reference} - ` : ""}
                  {item.description}
                </td>
                <td className="tabular border border-line px-2.5 py-1.5 text-right">
                  {formatQuantity(item.quantity)}
                </td>
                <td className="tabular border border-line px-2.5 py-1.5 text-right">
                  {formatAmount(item.unitPrice)}
                </td>
                <td className="tabular border border-line px-2.5 py-1.5 text-right">
                  {formatAmount(item.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales por divisa */}
      <div className="mt-8 -mx-1 overflow-x-auto px-1">
        <table className="print-table w-full min-w-[26rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="text-muted">
              <th className="border border-line px-2.5 py-1.5 text-left font-normal">Divisa</th>
              <th className="border border-line px-2.5 py-1.5 text-right font-normal">Neto</th>
              {invoice.taxTotal > 0 ? (
                <th className="border border-line px-2.5 py-1.5 text-right font-normal">ITBIS</th>
              ) : null}
              <th className="border border-line px-2.5 py-1.5 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-ink">
              <td className="border border-line px-2.5 py-1.5">
                {CURRENCY_LABEL[invoice.currency]}
              </td>
              <td className="tabular border border-line px-2.5 py-1.5 text-right">
                {formatAmount(invoice.subtotal)}
              </td>
              {invoice.taxTotal > 0 ? (
                <td className="tabular border border-line px-2.5 py-1.5 text-right">
                  {formatAmount(invoice.taxTotal)}
                </td>
              ) : null}
              <td className="tabular border border-line px-2.5 py-1.5 text-right font-semibold">
                {formatAmount(invoice.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Recibos */}
      {receipts.length > 0 ? (
        <div className="mt-4 -mx-1 overflow-x-auto px-1">
          <table className="print-table w-full min-w-[26rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="text-muted">
                <th className="border border-line px-2.5 py-1.5 text-center font-normal">Recibo</th>
                <th className="border border-line px-2.5 py-1.5 text-center font-normal">
                  Forma de pago
                </th>
                <th className="border border-line px-2.5 py-1.5 text-right font-normal">Importe</th>
                <th className="border border-line px-2.5 py-1.5 text-right font-normal">
                  Vencimiento
                </th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="text-ink">
                  <td className="tabular border border-line px-2.5 py-1.5 text-center">
                    {receipt.receiptNumber}
                  </td>
                  <td className="border border-line px-2.5 py-1.5 text-center">{receipt.method}</td>
                  <td className="tabular border border-line px-2.5 py-1.5 text-right">
                    {formatAmount(receipt.amount)}
                  </td>
                  <td className="tabular border border-line px-2.5 py-1.5 text-right">
                    {formatDateDO(receipt.dueDate)}
                    {receipt.paidDate ? " ✓" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {invoice.notes ? (
        <p className="mt-6 whitespace-pre-line text-[0.75rem] leading-relaxed text-muted">
          {invoice.notes}
        </p>
      ) : null}

      {company.rnc ? (
        <p className="mt-6 text-[0.6875rem] text-faint">
          RNC emisor: {company.rnc}
          {company.legalName ? ` · ${company.legalName}` : ""}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Superpone la copia congelada sobre el registro vivo, ignorando sus campos
 * nulos.
 *
 * Sin ese filtro, un campo que no existía cuando se emitió la factura llega
 * como `null` y borra el valor actual, dejando el dato en blanco en lugar de
 * caer al del registro vivo.
 */
export function withSnapshot<T extends object>(live: T, snapshot: unknown): T {
  if (!snapshot || typeof snapshot !== "object") return live;

  const merged = { ...live };
  for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
    if (value !== null && value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/** Las cantidades enteras se imprimen sin decimales, como en la factura original. */
function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(quantity);
}
