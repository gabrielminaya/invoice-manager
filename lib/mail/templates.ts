import type { Currency, InvoiceStatus } from "@/lib/db/schema";
import { formatDateDO, formatDateLong, type ISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { MailMessage } from "@/lib/mail/types";

/**
 * Plantillas de los correos de facturación.
 *
 * Cada plantilla devuelve el cuerpo del mensaje sin destinatario ni remitente:
 * quien llama añade el `to` y `sendMail` pone el `from`. Así se pueden probar
 * como funciones puras.
 *
 * Siempre se genera texto plano además del HTML: es lo que ven los clientes de
 * correo que bloquean HTML y mejora la entregabilidad.
 */

export type InvoiceMailData = {
  number: string;
  clientName: string;
  companyName: string;
  issueDate: ISODate;
  dueDate: ISODate;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  /** Enlace absoluto al detalle de la factura, si se puede construir. */
  url?: string;
  /** Descripción del período cubierto, en las facturas recurrentes. */
  periodLabel?: string;
};

export type MailBody = Pick<MailMessage, "subject" | "text" | "html" | "tags" | "idempotencyKey">;

/** Factura recién emitida. */
export function invoiceIssued(data: InvoiceMailData): MailBody {
  const amount = formatMoney(data.total, data.currency);

  const lines = [
    `Hola ${data.clientName},`,
    "",
    `Adjuntamos los datos de la factura ${data.number} emitida por ${data.companyName}.`,
    "",
    `Importe:      ${amount}`,
    `Emisión:      ${formatDateDO(data.issueDate)}`,
    `Vencimiento:  ${formatDateDO(data.dueDate)}`,
    data.periodLabel ? `Período:      ${data.periodLabel}` : null,
    "",
    data.url ? `Puedes consultarla aquí: ${data.url}` : null,
    data.url ? "" : null,
    "Gracias por tu confianza.",
    data.companyName,
  ].filter((line) => line !== null);

  return {
    subject: `Factura ${data.number} · ${amount}`,
    text: lines.join("\n"),
    html: layout({
      heading: `Factura ${data.number}`,
      intro: `Hola ${data.clientName}, esta es la factura emitida por ${data.companyName}.`,
      rows: [
        ["Importe", amount],
        ["Emisión", formatDateDO(data.issueDate)],
        ["Vencimiento", formatDateDO(data.dueDate)],
        ...(data.periodLabel ? [["Período", data.periodLabel] as [string, string]] : []),
      ],
      cta: data.url ? { label: "Ver la factura", url: data.url } : undefined,
      footer: data.companyName,
    }),
    tags: { type: "invoice_issued", invoice: data.number },
    idempotencyKey: `invoice-issued-${data.number}`,
  };
}

/** Recordatorio de factura vencida. */
export function invoiceOverdue(data: InvoiceMailData & { daysLate: number }): MailBody {
  const amount = formatMoney(data.total, data.currency);

  const lines = [
    `Hola ${data.clientName},`,
    "",
    `La factura ${data.number} venció el ${formatDateLong(data.dueDate)} ` +
      `(${data.daysLate} día(s) de atraso) y sigue pendiente de pago.`,
    "",
    `Importe pendiente: ${amount}`,
    "",
    data.url ? `Detalle: ${data.url}` : null,
    data.url ? "" : null,
    "Si ya realizaste el pago, ignora este mensaje o escríbenos para conciliarlo.",
    data.companyName,
  ].filter((line) => line !== null);

  return {
    subject: `Recordatorio: factura ${data.number} vencida`,
    text: lines.join("\n"),
    html: layout({
      heading: `Factura ${data.number} vencida`,
      intro:
        `Hola ${data.clientName}, la factura venció el ${formatDateLong(data.dueDate)} ` +
        `y sigue pendiente.`,
      rows: [
        ["Importe pendiente", amount],
        ["Vencimiento", formatDateDO(data.dueDate)],
        ["Días de atraso", String(data.daysLate)],
      ],
      cta: data.url ? { label: "Ver la factura", url: data.url } : undefined,
      footer: `Si ya pagaste, ignora este mensaje. — ${data.companyName}`,
    }),
    tags: { type: "invoice_overdue", invoice: data.number },
    // La clave incluye el día: un recordatorio por jornada, no uno solo nunca más.
    idempotencyKey: `invoice-overdue-${data.number}-${data.daysLate}`,
  };
}

/** Confirmación de pago recibido. */
export function paymentReceipt(
  data: InvoiceMailData & { paidDate: ISODate; receiptNumber: number },
): MailBody {
  const amount = formatMoney(data.total, data.currency);

  const lines = [
    `Hola ${data.clientName},`,
    "",
    `Confirmamos el pago de la factura ${data.number}. ¡Gracias!`,
    "",
    `Importe:  ${amount}`,
    `Fecha:    ${formatDateDO(data.paidDate)}`,
    `Recibo:   ${data.receiptNumber}`,
    "",
    data.url ? `Detalle: ${data.url}` : null,
    data.url ? "" : null,
    data.companyName,
  ].filter((line) => line !== null);

  return {
    subject: `Pago recibido · factura ${data.number}`,
    text: lines.join("\n"),
    html: layout({
      heading: "Pago recibido",
      intro: `Hola ${data.clientName}, confirmamos el pago de la factura ${data.number}.`,
      rows: [
        ["Importe", amount],
        ["Fecha del pago", formatDateDO(data.paidDate)],
        ["Recibo", String(data.receiptNumber)],
      ],
      cta: data.url ? { label: "Ver la factura", url: data.url } : undefined,
      footer: data.companyName,
    }),
    tags: { type: "payment_receipt", invoice: data.number },
    idempotencyKey: `payment-receipt-${data.number}-${data.receiptNumber}`,
  };
}

/* ------------------------------------------------------------------ *
 * Maquetación
 * ------------------------------------------------------------------ */

const BRAND = "#3a49c9";

/**
 * Plantilla HTML común.
 *
 * Estilos en línea y una tabla de una sola columna: es lo único que renderizan
 * de forma consistente Outlook, Gmail y Apple Mail.
 */
function layout({
  heading,
  intro,
  rows,
  cta,
  footer,
}: {
  heading: string;
  intro: string;
  rows: [string, string][];
  cta?: { label: string; url: string };
  footer: string;
}): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">${escapeHtml(label)}</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
          </tr>`,
    )
    .join("");

  const ctaHtml = cta
    ? `
        <tr>
          <td style="padding:24px 0 8px;">
            <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>`
    : "";

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px 12px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:28px 28px 0;">
          <h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(heading)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">${escapeHtml(intro)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
            ${rowsHtml}
            ${ctaHtml}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px 28px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">${escapeHtml(footer)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
