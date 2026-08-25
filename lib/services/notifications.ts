import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, companies, invoices, payments } from "@/lib/db/schema";
import { diffInDays, formatDateDO, todayInTimeZone } from "@/lib/dates";
import {
  dedupeAddresses,
  parseAddressList,
  sendMail,
  templates,
  toRecipients,
  type MailAddress,
  type MailResult,
} from "@/lib/mail";
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

/** Base absoluta para los enlaces del correo. Sin ella, el correo va sin botón. */
function appUrl(): string | null {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

type InvoiceContext = {
  data: InvoiceMailData;
  recipientEmail: string | null;
  /** Copias del cliente más la compañía emisora, ya sin repetidos. */
  cc: MailAddress[];
  receiptNumber: number;
};

async function loadInvoiceContext(invoiceId: string): Promise<InvoiceContext | null> {
  const [row] = await db
    .select({
      invoice: invoices,
      clientName: clients.name,
      clientEmail: clients.email,
      clientEmailCc: clients.emailCc,
      companyName: companies.name,
      companyEmail: companies.email,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!row) return null;

  const [receipt] = await db
    .select({ receiptNumber: payments.receiptNumber })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .limit(1);

  const base = appUrl();

  // La compañía emisora se copia siempre que tenga correo: así queda constancia
  // de lo enviado en su propio buzón, sin depender de la bandeja del proveedor.
  const cc = dedupeAddresses(
    [...parseAddressList(row.clientEmailCc), ...parseAddressList(row.companyEmail)],
    row.clientEmail ? toRecipients(row.clientEmail) : [],
  );

  return {
    recipientEmail: row.clientEmail,
    cc,
    receiptNumber: receipt?.receiptNumber ?? 1,
    data: {
      number: row.invoice.number,
      clientName: row.clientName,
      companyName: row.companyName,
      issueDate: row.invoice.issueDate,
      dueDate: row.invoice.dueDate,
      total: row.invoice.total,
      currency: row.invoice.currency,
      status: row.invoice.status,
      url: base ? `${base}/invoices/${row.invoice.id}` : undefined,
      // Se formatea la ventana guardada en la factura en lugar de recalcularla:
      // así la etiqueta es correcta para cualquier frecuencia, no solo mensual.
      periodLabel:
        row.invoice.periodStart && row.invoice.periodEnd
          ? `${formatDateDO(row.invoice.periodStart)} al ${formatDateDO(row.invoice.periodEnd)}`
          : undefined,
    },
  };
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
    ...templates.invoiceOverdue({ ...context.data, daysLate }),
  });
}
