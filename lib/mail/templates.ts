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

/** Datos de la compañía emisora para la cabecera y el pie del correo. */
export type CompanyMailInfo = {
  legalName?: string | null;
  rnc?: string | null;
  addressLine?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  /** Ruta o URL del logo. Solo se usa si resuelve a una URL pública https. */
  logoUrl?: string | null;
};

export type InvoiceMailData = {
  number: string;
  clientName: string;
  companyName: string;
  issueDate: ISODate;
  dueDate: ISODate;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  /**
   * Enlace absoluto a la factura. Solo debe pasarse si el destinatario puede
   * abrirlo: el detalle de `/invoices/[id]` exige sesión y el cliente no la tiene.
   */
  url?: string;
  /** La factura viaja en PDF adjunto; el texto lo menciona. */
  pdfAttached?: boolean;
  /** Descripción del período cubierto, en las facturas recurrentes. */
  periodLabel?: string;
  company?: CompanyMailInfo;
};

export type MailBody = Pick<MailMessage, "subject" | "text" | "html" | "tags" | "idempotencyKey">;

/** Factura recién emitida. */
export function invoiceIssued(data: InvoiceMailData): MailBody {
  const amount = formatMoney(data.total, data.currency);

  const lines = [
    `Estimado(a) ${data.clientName}:`,
    "",
    data.pdfAttached
      ? `Le enviamos adjunta en PDF la factura ${data.number} emitida por ${data.companyName}.`
      : `Le compartimos los datos de la factura ${data.number} emitida por ${data.companyName}.`,
    "",
    `Importe:      ${amount}`,
    `Emisión:      ${formatDateDO(data.issueDate)}`,
    `Vencimiento:  ${formatDateDO(data.dueDate)}`,
    data.periodLabel ? `Período:      ${data.periodLabel}` : null,
    "",
    data.url ? `Puedes consultarla aquí: ${data.url}` : null,
    data.url ? "" : null,
    `Si tiene alguna consulta sobre esta factura, ${contactPhrase(data.company)}.`,
    "",
    "Atentamente,",
    data.companyName,
    ...companyTextFooter(data.company),
  ].filter((line) => line !== null);

  return {
    subject: `Factura ${data.number} · ${amount}`,
    text: lines.join("\n"),
    html: layout({
      data,
      label: "Factura",
      preheader: `Factura ${data.number} por ${amount}, vence el ${formatDateDO(data.dueDate)}.`,
      greeting: `Estimado(a) ${data.clientName}:`,
      intro:
        `Le enviamos la factura ${data.number} correspondiente a nuestros servicios.` +
        (data.pdfAttached ? " Encontrará el documento en PDF adjunto a este correo." : ""),
      summary: {
        label: "Total a pagar",
        amount,
        note: `Vence el ${formatDateLong(data.dueDate)}`,
        badge: { text: "Pendiente de pago", tone: "info" },
      },
      rows: [
        ["Número de factura", data.number],
        ["Fecha de emisión", formatDateDO(data.issueDate)],
        ["Fecha de vencimiento", formatDateDO(data.dueDate)],
        ...(data.periodLabel ? [["Período", data.periodLabel] as [string, string]] : []),
      ],
      cta: data.url ? { label: "Ver la factura", url: data.url } : undefined,
      closing: `Si tiene alguna consulta sobre esta factura, ${contactPhrase(data.company)}.`,
    }),
    tags: { type: "invoice_issued", invoice: data.number },
    idempotencyKey: `invoice-issued-${data.number}`,
  };
}

/** Recordatorio de factura vencida. */
export function invoiceOverdue(data: InvoiceMailData & { daysLate: number }): MailBody {
  const amount = formatMoney(data.total, data.currency);
  const days = data.daysLate === 1 ? "1 día" : `${data.daysLate} días`;

  const lines = [
    `Estimado(a) ${data.clientName}:`,
    "",
    `La factura ${data.number} venció el ${formatDateLong(data.dueDate)} ` +
      `(${data.daysLate} día(s) de atraso) y sigue pendiente de pago.`,
    "",
    `Importe pendiente: ${amount}`,
    "",
    data.pdfAttached ? "Le adjuntamos nuevamente la factura en PDF." : null,
    data.pdfAttached ? "" : null,
    data.url ? `Detalle: ${data.url}` : null,
    data.url ? "" : null,
    `Si ya realizó el pago, le agradecemos que nos lo confirme: ${contactPhrase(data.company)}.`,
    "",
    "Atentamente,",
    data.companyName,
    ...companyTextFooter(data.company),
  ].filter((line) => line !== null);

  return {
    subject: `Recordatorio: factura ${data.number} vencida`,
    text: lines.join("\n"),
    html: layout({
      data,
      label: "Recordatorio de pago",
      preheader: `La factura ${data.number} por ${amount} tiene ${days} de atraso.`,
      greeting: `Estimado(a) ${data.clientName}:`,
      intro:
        `Le recordamos que la factura ${data.number} venció el ${formatDateLong(data.dueDate)} ` +
        `y, según nuestros registros, sigue pendiente de pago.` +
        (data.pdfAttached ? " Le adjuntamos nuevamente el documento en PDF." : ""),
      summary: {
        label: "Importe pendiente",
        amount,
        note: `${days} de atraso`,
        badge: { text: "Vencida", tone: "danger" },
      },
      rows: [
        ["Número de factura", data.number],
        ["Fecha de emisión", formatDateDO(data.issueDate)],
        ["Fecha de vencimiento", formatDateDO(data.dueDate)],
        ["Días de atraso", String(data.daysLate)],
      ],
      cta: data.url ? { label: "Ver la factura", url: data.url } : undefined,
      closing:
        `Si ya realizó el pago, le agradecemos que nos lo confirme para conciliarlo: ${contactPhrase(data.company)}.`,
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
    `Estimado(a) ${data.clientName}:`,
    "",
    `Confirmamos la recepción del pago de la factura ${data.number}. Muchas gracias.`,
    "",
    `Importe:  ${amount}`,
    `Fecha:    ${formatDateDO(data.paidDate)}`,
    `Recibo:   ${data.receiptNumber}`,
    "",
    data.pdfAttached ? "Adjuntamos la factura en PDF, ya marcada como pagada." : null,
    data.pdfAttached ? "" : null,
    data.url ? `Detalle: ${data.url}` : null,
    data.url ? "" : null,
    "Atentamente,",
    data.companyName,
    ...companyTextFooter(data.company),
  ].filter((line) => line !== null);

  return {
    subject: `Pago recibido · factura ${data.number}`,
    text: lines.join("\n"),
    html: layout({
      data,
      label: "Comprobante de pago",
      preheader: `Recibimos su pago de ${amount} de la factura ${data.number}.`,
      greeting: `Estimado(a) ${data.clientName}:`,
      intro:
        `Confirmamos la recepción de su pago de la factura ${data.number}. Le agradecemos su puntualidad.` +
        (data.pdfAttached ? " Adjuntamos la factura en PDF, ya marcada como pagada." : ""),
      summary: {
        label: "Importe pagado",
        amount,
        note: `Recibido el ${formatDateLong(data.paidDate)}`,
        badge: { text: "Pagada", tone: "success" },
      },
      rows: [
        ["Número de factura", data.number],
        ["Recibo", String(data.receiptNumber)],
        ["Fecha del pago", formatDateDO(data.paidDate)],
      ],
      cta: data.url ? { label: "Ver la factura", url: data.url } : undefined,
      closing: "Gracias por su confianza. Quedamos a su disposición para cualquier consulta.",
    }),
    tags: { type: "payment_receipt", invoice: data.number },
    idempotencyKey: `payment-receipt-${data.number}-${data.receiptNumber}`,
  };
}

/* ------------------------------------------------------------------ *
 * Maquetación
 * ------------------------------------------------------------------ */

const BRAND = "#3a49c9";
const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";
const SURFACE = "#f9fafb";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const TONES = {
  info: { bg: "#eef0fc", fg: "#2f3ba6" },
  danger: { bg: "#fdecec", fg: "#b42318" },
  success: { bg: "#e7f6ec", fg: "#1e7a3c" },
} as const;

type LayoutInput = {
  data: InvoiceMailData;
  /** Etiqueta del tipo de documento en la cabecera ("Factura", "Recordatorio"…). */
  label: string;
  /** Texto que los clientes de correo muestran junto al asunto. */
  preheader: string;
  greeting: string;
  intro: string;
  summary: {
    label: string;
    amount: string;
    note: string;
    badge: { text: string; tone: keyof typeof TONES };
  };
  rows: [string, string][];
  cta?: { label: string; url: string };
  closing: string;
};

/**
 * Plantilla HTML común.
 *
 * Estilos en línea y tablas anidadas: es lo único que renderizan de forma
 * consistente Outlook, Gmail y Apple Mail. Nada de imágenes de fondo, flexbox
 * ni hojas de estilo.
 */
function layout({ data, label, preheader, greeting, intro, summary, rows, cta, closing }: LayoutInput): string {
  const company = data.company ?? {};
  const logo = publicLogoUrl(company.logoUrl);
  const tone = TONES[summary.badge.tone];

  const brandHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(data.companyName)}" height="40" style="display:block;height:40px;width:auto;border:0;outline:none;">`
    : `<span style="font-size:20px;font-weight:700;color:${INK};letter-spacing:-0.2px;">${escapeHtml(data.companyName)}</span>`;

  const rowsHtml = rows
    .map(
      ([key, value], index) => `
                <tr>
                  <td style="padding:12px 0;${index > 0 ? `border-top:1px solid ${LINE};` : ""}font-size:14px;color:${MUTED};">${escapeHtml(key)}</td>
                  <td align="right" style="padding:12px 0;${index > 0 ? `border-top:1px solid ${LINE};` : ""}font-size:14px;color:${INK};font-weight:600;">${escapeHtml(value)}</td>
                </tr>`,
    )
    .join("");

  const ctaHtml = cta
    ? `
          <tr>
            <td style="padding:16px 40px 8px;">
              <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(cta.label)}</a>
            </td>
          </tr>`
    : "";

  const legal = [company.legalName || data.companyName, company.rnc ? `RNC ${company.rnc}` : null]
    .filter(Boolean)
    .join(" · ");
  const address = [company.addressLine, company.city, company.country].filter(Boolean).join(", ");
  const contact = [company.email, company.phone, company.website].filter(Boolean).join(" · ");
  const footerLines = [legal, address, contact]
    .filter(Boolean)
    .map((line) => `<div style="padding-top:2px;">${escapeHtml(line as string)}</div>`)
    .join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(`${label} ${data.number}`)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid ${LINE};overflow:hidden;">
            <tr><td style="height:4px;line-height:4px;font-size:0;background:${BRAND};">&nbsp;</td></tr>
            <tr>
              <td style="padding:28px 40px 24px;border-bottom:1px solid ${LINE};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle">${brandHtml}</td>
                    <td valign="middle" align="right" style="font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}<div style="font-size:14px;letter-spacing:0;text-transform:none;color:${INK};padding-top:2px;">${escapeHtml(data.number)}</div></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 0;">
                <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:${INK};">${escapeHtml(greeting)}</p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:${BODY};">${escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border:1px solid ${LINE};border-radius:10px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <div style="font-size:12px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:${MUTED};">${escapeHtml(summary.label)}</div>
                      <div style="font-size:32px;line-height:1.2;font-weight:700;color:${INK};padding-top:6px;letter-spacing:-0.5px;">${escapeHtml(summary.amount)}</div>
                      <div style="font-size:14px;color:${MUTED};padding-top:4px;">${escapeHtml(summary.note)}</div>
                    </td>
                    <td align="right" valign="top" style="padding:22px 24px;">
                      <span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;white-space:nowrap;">${escapeHtml(summary.badge.text)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
                </table>
              </td>
            </tr>${ctaHtml}
            <tr>
              <td style="padding:24px 40px 36px;">
                <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${BODY};">${escapeHtml(closing)}</p>
                <p style="margin:0;font-size:14px;line-height:1.5;color:${BODY};">Atentamente,<br><strong style="color:${INK};">${escapeHtml(data.companyName)}</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background:${SURFACE};border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${FAINT};">
                ${footerLines}
                <div style="padding-top:10px;">Este mensaje se generó automáticamente a partir de nuestro sistema de facturación.${acceptsReplies() ? "" : " Por favor, no responda a este correo."}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * El remitente suele ser un `noreply@`, así que solo se invita a responder al
 * correo si hay MAIL_REPLY_TO. Si no, se remite al correo de la compañía.
 */
function acceptsReplies(): boolean {
  return Boolean(process.env.MAIL_REPLY_TO?.trim());
}

function contactPhrase(company: CompanyMailInfo | undefined): string {
  if (acceptsReplies()) return "puede responder directamente a este correo";
  if (company?.email) return `puede escribirnos a ${company.email}`;
  return "no dude en contactarnos";
}

/** Datos legales y de contacto de la compañía al pie del texto plano. */
function companyTextFooter(company: CompanyMailInfo | undefined): string[] {
  if (!company) return [];
  const legal = [company.legalName, company.rnc ? `RNC ${company.rnc}` : null].filter(Boolean).join(" · ");
  const contact = [company.email, company.phone, company.website].filter(Boolean).join(" · ");
  return [legal, contact].filter(Boolean);
}

/**
 * Los clientes de correo solo muestran imágenes servidas por https desde una
 * dirección pública: ni data URIs (Gmail las bloquea) ni localhost. Una ruta
 * relativa se resuelve contra APP_URL cuando este es público.
 */
function publicLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (/^https:\/\//i.test(logoUrl)) return logoUrl;
  if (!logoUrl.startsWith("/")) return null;

  const base = process.env.APP_URL?.trim();
  if (!base || !/^https:\/\//i.test(base) || /\/\/(localhost|127\.|0\.0\.0\.0)/i.test(base)) return null;
  return `${base.replace(/\/+$/, "")}${logoUrl}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
