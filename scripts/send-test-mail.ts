/**
 * Envía un correo de prueba con el proveedor configurado.
 *
 *   pnpm mail:test -- tu@correo.com
 *
 * Sirve para comprobar de una vez que la clave de Resend funciona, que el
 * dominio del remitente está verificado y que el correo llega con buen aspecto.
 * Si no hay clave, sale por el proveedor simulado y lo imprime en la consola.
 *
 * Reproduce el correo real de factura emitida: sin enlace y con el PDF adjunto.
 * El PDF se genera con la factura más reciente de la base de datos (o con datos
 * de ejemplo si no hay ninguna), pero el correo va SOLO a la dirección indicada,
 * nunca al cliente de esa factura.
 *
 * Con MAIL_PROVIDER=mock no se gasta cuota: el HTML y el PDF se guardan en una
 * carpeta temporal y se abren para revisar el diseño.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { describeMailConfig, sendMail, toRecipients } from "@/lib/mail";
import { templates } from "@/lib/mail";
import { todayInTimeZone } from "@/lib/dates";
import { invoicePdfFilename, renderInvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice-pdf";
import type { Client, Company, Invoice, InvoiceItem } from "@/lib/db/schema";

async function loadLatestInvoice(): Promise<InvoicePdfData | null> {
  try {
    const { db } = await import("@/lib/db");
    const { clients, companies, invoiceItems, invoices, payments } = await import("@/lib/db/schema");

    const [row] = await db
      .select({ invoice: invoices, client: clients, company: companies })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .innerJoin(companies, eq(companies.id, invoices.companyId))
      .orderBy(desc(invoices.issueDate))
      .limit(1);
    if (!row) return null;

    const [items, receipts] = await Promise.all([
      db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, row.invoice.id)).orderBy(asc(invoiceItems.position)),
      db.select().from(payments).where(eq(payments.invoiceId, row.invoice.id)).orderBy(asc(payments.receiptNumber)),
    ]);
    return { ...row, items, receipts };
  } catch (error) {
    const cause = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message.split("\n")[0].slice(0, 120)) : String(error);
    console.log(`  aviso: no se pudo leer la base de datos (${cause}); se usan datos de ejemplo.`);
    return null;
  }
}

function sampleInvoice(today: string): InvoicePdfData {
  const companyName = process.env.MAIL_FROM?.split("<")[0].trim() || "Tu compañía";
  return {
    company: { id: "test", name: companyName, legalName: companyName, country: "República Dominicana" } as unknown as Company,
    client: { id: "test", name: "Cliente de prueba" } as unknown as Client,
    invoice: {
      id: "test",
      number: "FAC000TEST",
      series: "Prueba",
      seriesNumber: 0,
      issueDate: today,
      dueDate: today,
      currency: "DOP",
      subtotal: 1046.24,
      taxTotal: 188.32,
      total: 1234.56,
      status: "issued",
      notes: "Correo de prueba.",
      companySnapshot: null,
      clientSnapshot: null,
    } as unknown as Invoice,
    items: [
      { id: "test", reference: null, description: "Servicio de prueba", quantity: 1, unitPrice: 1046.24, net: 1046.24 } as unknown as InvoiceItem,
    ],
    receipts: [],
  };
}

async function main() {
  const recipient = process.argv.slice(2).find((arg) => arg.includes("@"));

  if (!recipient) {
    console.error("Uso: pnpm mail:test -- tu@correo.com");
    process.exit(1);
  }

  const config = describeMailConfig();
  console.log(`Proveedor: ${config.provider}${config.autoDetected ? " (detectado)" : ""}`);
  console.log(`Remitente: ${config.from ?? "(sin MAIL_FROM)"}`);
  for (const problem of config.problems) console.log(`  aviso: ${problem}`);

  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");
  const data = (await loadLatestInvoice()) ?? sampleInvoice(today);
  const { invoice, client, company } = data;
  console.log(`Factura usada: ${invoice.number} (${client.name})`);
  console.log("");

  const pdf = await renderInvoicePdf(data);
  const pdfFilename = invoicePdfFilename(invoice.number);

  const body = templates.invoiceIssued({
    number: invoice.number,
    clientName: client.name,
    companyName: company.name,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    total: invoice.total,
    currency: invoice.currency,
    status: invoice.status,
    pdfAttached: true,
    periodLabel: "correo de prueba",
    company,
  });

  if (config.provider === "mock") {
    const dir = mkdtempSync(join(tmpdir(), "mail-preview-"));
    const htmlPath = join(dir, "correo.html");
    writeFileSync(htmlPath, body.html ?? "");
    writeFileSync(join(dir, pdfFilename), pdf);
    console.log(`Vista previa guardada en ${dir}`);
    if (process.platform === "darwin") execFileSync("open", [htmlPath, join(dir, pdfFilename)]);
  }

  const result = await sendMail({
    to: toRecipients(recipient),
    attachments: [
      {
        filename: pdfFilename,
        content: Buffer.from(pdf).toString("base64"),
        contentType: "application/pdf",
      },
    ],
    ...body,
    // Clave única por ejecución: si no, Resend descartaría el segundo intento.
    idempotencyKey: `test-${Date.now()}`,
  });

  if (result.ok && result.skipped) {
    console.log(`Envío omitido (${result.reason}).`);
    return;
  }

  if (result.ok) {
    console.log(`Enviado con ${result.provider}. Id: ${result.id}`);
    return;
  }

  console.error(`Falló el envío con ${result.provider}:`);
  console.error(`  ${result.error}`);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
