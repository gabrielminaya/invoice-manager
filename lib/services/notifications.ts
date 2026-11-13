import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, companies, invoiceItems, invoices, payments } from "@/lib/db/schema";
import { diffInDays, formatDateDO, todayInTimeZone } from "@/lib/dates";
import {
  dedupeAddresses,
  parseAddressList,
  sendMail,
  templates,
  toRecipients,
  type MailAddress,
  type MailAttachment,
  type MailResult,
} from "@/lib/mail";
import { invoicePdfFilename, renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import type { InvoiceMailData } from "@/lib/mail/templates";

/**
 * Avisos por correo ligados a la facturación.
 *
 * Aísla el "qué datos necesita la plantilla" del "cuándo se envía": el cronjob y
 * las acciones de la UI solo llaman a estas funciones con un id de factura.
 *
 * Ninguna lanza: un fallo de correo se registra y se devuelve, pero nunca
 * revierte una emisión ni interrumpe una corrida del cron.
 */

type InvoiceContext = {
  data: InvoiceMailData;
  recipientEmail: string | null;
  /** Copias del cliente más la compañía emisora, ya sin repetidos. */
  cc: MailAddress[];
  receiptNumber: number;
  /** Factura en PDF, o null si no se pudo generar (el correo sale igual). */
  attachment: MailAttachment | null;
};

async function loadInvoiceContext(invoiceId: string): Promise<InvoiceContext | null> {
  const [row] = await db
    .select({ invoice: invoices, client: clients, company: companies })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!row) return null;

  const [items, receipts] = await Promise.all([
    db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId))
      .orderBy(asc(invoiceItems.position)),
    db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(asc(payments.receiptNumber)),
  ]);

  const attachment = await buildPdfAttachment({ ...row, items, receipts });

  // La compañía emisora se copia siempre que tenga correo: así queda constancia
  // de lo enviado en su propio buzón, sin depender de la bandeja del proveedor.
  const cc = dedupeAddresses(
    [...parseAddressList(row.client.emailCc), ...parseAddressList(row.company.email)],
    row.client.email ? toRecipients(row.client.email) : [],
  );

  return {
    recipientEmail: row.client.email,
    cc,
    receiptNumber: receipts[0]?.receiptNumber ?? 1,
    attachment,
    data: {
      number: row.invoice.number,
      clientName: row.client.name,
      companyName: row.company.name,
      issueDate: row.invoice.issueDate,
      dueDate: row.invoice.dueDate,
      total: row.invoice.total,
      currency: row.invoice.currency,
      status: row.invoice.status,
      // Sin `url`: el detalle de la factura exige sesión y el cliente no la
      // tiene, así que el enlace lo dejaba en el login. Va el PDF adjunto.
      pdfAttached: attachment !== null,
      // Se formatea la ventana guardada en la factura en lugar de recalcularla:
      // así la etiqueta es correcta para cualquier frecuencia, no solo mensual.
      periodLabel:
        row.invoice.periodStart && row.invoice.periodEnd
          ? `${formatDateDO(row.invoice.periodStart)} al ${formatDateDO(row.invoice.periodEnd)}`
          : undefined,
    },
  };
}

async function buildPdfAttachment(
  data: Parameters<typeof renderInvoicePdf>[0],
): Promise<MailAttachment | null> {
  try {
    const bytes = await renderInvoicePdf(data);
    return {
      filename: invoicePdfFilename(data.invoice.number),
      content: Buffer.from(bytes).toString("base64"),
      contentType: "application/pdf",
    };
  } catch (error) {
    // Un PDF fallido no debe impedir el aviso: el correo lleva igual los datos.
    console.error(`[mail] no se pudo generar el PDF de ${data.invoice.number}:`, error);
    return null;
  }
}

const skipped = (reason: string): MailResult => ({
  ok: true,
  id: null,
  provider: "none",
  skipped: true,
  reason,
});

/** Envía al cliente la factura recién emitida. */
export async function notifyInvoiceIssued(invoiceId: string): Promise<MailResult> {
  const context = await loadInvoiceContext(invoiceId);
  if (!context) return skipped("la factura no existe");
  if (!context.recipientEmail) return skipped("el cliente no tiene correo");

  return sendMail({
    to: toRecipients(context.recipientEmail),
    cc: context.cc,
    attachments: context.attachment ? [context.attachment] : undefined,
    ...templates.invoiceIssued(context.data),
  });
}

/** Confirma al cliente que su pago quedó registrado. */
export async function notifyPaymentReceipt(invoiceId: string): Promise<MailResult> {
  const context = await loadInvoiceContext(invoiceId);
  if (!context) return skipped("la factura no existe");
  if (!context.recipientEmail) return skipped("el cliente no tiene correo");

  return sendMail({
    to: toRecipients(context.recipientEmail),
    cc: context.cc,
    attachments: context.attachment ? [context.attachment] : undefined,
    ...templates.paymentReceipt({
      ...context.data,
      paidDate: todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo"),
      receiptNumber: context.receiptNumber,
    }),
  });
}

/** Recuerda al cliente una factura vencida. */
export async function notifyInvoiceOverdue(invoiceId: string, asOf: string): Promise<MailResult> {
  const context = await loadInvoiceContext(invoiceId);
  if (!context) return skipped("la factura no existe");
  if (!context.recipientEmail) return skipped("el cliente no tiene correo");

  const daysLate = diffInDays(context.data.dueDate, asOf);
  if (daysLate <= 0) return skipped("la factura todavía no está vencida");

  return sendMail({
    to: toRecipients(context.recipientEmail),
    cc: context.cc,
    attachments: context.attachment ? [context.attachment] : undefined,
    ...templates.invoiceOverdue({ ...context.data, daysLate }),
  });
}
