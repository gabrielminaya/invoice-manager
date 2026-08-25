import { and, eq, sql as raw } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { db } from "@/lib/db";
import {
  clients,
  companies,
  invoiceItems,
  invoices,
  payments,
  subscriptionItems,
  subscriptions,
  type Client,
  type Company,
  type Currency,
  type Invoice,
} from "@/lib/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { documentTotals, lineTotals, fromCents } from "@/lib/money";
import { reserveInvoiceNumber } from "@/lib/numbering";
import { advance, periodLabel, resolveStatusAfterRun, type DueOccurrence } from "@/lib/recurrence";

/** Código que Postgres devuelve al violar un índice único. */
const UNIQUE_VIOLATION = "23505";

/**
 * Detecta una violación de índice único.
 *
 * Drizzle envuelve los errores del driver en `DrizzleQueryError` y deja el
 * `PostgresError` original en `cause`, así que hay que recorrer la cadena: mirar
 * solo el nivel superior deja pasar el error y rompe la idempotencia.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current === "object" && (current as { code?: string }).code === UNIQUE_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export type DraftLine = {
  reference?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

/**
 * Datos fiscales congelados en la factura al momento de emitir.
 *
 * El logo queda deliberadamente fuera: es identidad de marca, no un dato
 * fiscal. Al leerlo siempre de la compañía viva, cambiar o añadir el logo se
 * refleja también al reimprimir facturas antiguas, que es lo que se espera.
 */
function companySnapshot(company: Company) {
  return {
    name: company.name,
    legalName: company.legalName,
    rnc: company.rnc,
    addressLine: company.addressLine,
    city: company.city,
    postalCode: company.postalCode,
    region: company.region,
    country: company.country,
    phone: company.phone,
    email: company.email,
  };
}

function clientSnapshot(client: Client) {
  return {
    name: client.name,
    rnc: client.rnc,
    addressLine: client.addressLine,
    city: client.city,
    country: client.country,
    email: client.email,
    phone: client.phone,
  };
}

export type CreateInvoiceInput = {
  companyId: string;
  clientId: string;
  subscriptionId?: string | null;
  issueDate: ISODate;
  dueDate?: ISODate | null;
  currency?: Currency | null;
  paymentMethod?: string | null;
  notes?: string | null;
  lines: DraftLine[];
  status?: "draft" | "issued";
  periodKey?: string | null;
  periodStart?: ISODate | null;
  periodEnd?: ISODate | null;
  generatedByCron?: boolean;
};

/**
 * Inserta una factura completa (cabecera, líneas y recibo pendiente).
 *
 * Se ejecuta dentro de la transacción `tx` que recibe, porque la reserva del
 * número correlativo y la inserción tienen que ser atómicas: si algo falla
 * después de reservar, el número no se debe consumir.
 */
export async function insertInvoice(tx: DbOrTx, input: CreateInvoiceInput): Promise<Invoice> {
  const [company] = await tx
    .select()
    .from(companies)
    .where(eq(companies.id, input.companyId))
    .limit(1);
  if (!company) throw new Error("La compañía indicada no existe");

  const [client] = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.companyId, input.companyId)))
    .limit(1);
  if (!client) throw new Error("El cliente no existe o no pertenece a esta compañía");

  if (input.lines.length === 0) throw new Error("La factura necesita al menos una línea");

  const currency = input.currency ?? client.currency ?? company.defaultCurrency;
  const termsDays =
    client.paymentTermsDays ?? company.defaultPaymentTermsDays ?? 0;
  const dueDate = input.dueDate ?? addDays(input.issueDate, termsDays);
  const paymentMethod = input.paymentMethod ?? company.defaultPaymentMethod;

  const totals = documentTotals(input.lines);
  const numbering = await reserveInvoiceNumber(tx, input.companyId);
  const status = input.status ?? "draft";

  const [invoice] = await tx
    .insert(invoices)
    .values({
      companyId: input.companyId,
      clientId: input.clientId,
      subscriptionId: input.subscriptionId ?? null,
      number: numbering.number,
      series: numbering.series,
      seriesNumber: numbering.seriesNumber,
      issueDate: input.issueDate,
      dueDate,
      currency,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      status,
      paymentMethod,
      notes: input.notes ?? null,
      periodKey: input.periodKey ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      companySnapshot: companySnapshot(company),
      clientSnapshot: clientSnapshot(client),
      issuedAt: status === "issued" ? raw`now()` : null,
      generatedByCron: input.generatedByCron ?? false,
    })
    .returning();

  await tx.insert(invoiceItems).values(
    input.lines.map((line, index) => {
      const { netCents, taxCents } = lineTotals(line);
      return {
        invoiceId: invoice.id,
        reference: line.reference ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        net: fromCents(netCents),
        taxAmount: fromCents(taxCents),
        position: index,
      };
    }),
  );

  // El "Recibo" de la factura: importe esperado y su vencimiento, aún sin pagar.
  await tx.insert(payments).values({
    invoiceId: invoice.id,
    receiptNumber: 1,
    amount: totals.total,
    method: paymentMethod,
    dueDate,
  });

  return invoice;
}

export type GeneratedInvoice = {
  invoice: Invoice;
  occurrence: DueOccurrence;
};

/**
 * Emite la factura de un ciclo concreto de una suscripción y adelanta el
 * calendario de la suscripción.
 *
 * Devuelve `null` cuando el ciclo ya estaba facturado: el índice único
 * (subscription_id, period_key) hace que un segundo intento choque, lo que
 * convierte al endpoint del cron en idempotente incluso con ejecuciones
 * solapadas.
 */
export async function issueOccurrence(
  subscriptionId: string,
  occurrence: DueOccurrence,
): Promise<GeneratedInvoice | null> {
  try {
    return await db.transaction(async (tx) => {
      // Bloquear la suscripción evita que dos ejecuciones del cron avancen
      // `next_run_date` en paralelo.
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .for("update")
        .limit(1);
      if (!sub) throw new Error("La recurrencia no existe");
      if (sub.status !== "active") return null;

      const items = await tx
        .select()
        .from(subscriptionItems)
        .where(eq(subscriptionItems.subscriptionId, subscriptionId))
        .orderBy(subscriptionItems.position);
      if (items.length === 0) throw new Error("La recurrencia no tiene conceptos que facturar");

      const label = periodLabel(occurrence.scheduledDate, sub.interval, sub.intervalCount);

      const invoice = await insertInvoice(tx, {
        companyId: sub.companyId,
        clientId: sub.clientId,
        subscriptionId: sub.id,
        issueDate: occurrence.scheduledDate,
        dueDate: sub.paymentTermsDays != null
          ? addDays(occurrence.scheduledDate, sub.paymentTermsDays)
          : null,
        currency: sub.currency,
        paymentMethod: sub.paymentMethod,
        notes: `Período facturado: ${label}${sub.notes ? `\n${sub.notes}` : ""}`,
        status: sub.autoIssue ? "issued" : "draft",
        periodKey: occurrence.periodKey,
        periodStart: occurrence.periodStart,
        periodEnd: occurrence.periodEnd,
        generatedByCron: true,
        lines: items.map((item) => ({
          reference: item.reference,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
        })),
      });

      const occurrences = sub.occurrences + 1;
      const nextRunDate = advance(
        occurrence.scheduledDate,
        sub.interval,
        sub.intervalCount,
        sub.anchorDay,
      );
      const status = resolveStatusAfterRun(
        {
          nextRunDate: sub.nextRunDate,
          interval: sub.interval,
          intervalCount: sub.intervalCount,
          anchorDay: sub.anchorDay,
          endDate: sub.endDate,
          maxOccurrences: sub.maxOccurrences,
          occurrences,
        },
        nextRunDate,
        occurrences,
      );

      await tx
        .update(subscriptions)
        .set({
          nextRunDate,
          lastRunDate: occurrence.scheduledDate,
          occurrences,
          status,
          updatedAt: raw`now()`,
        })
        .where(eq(subscriptions.id, sub.id));

      return { invoice, occurrence };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null; // ciclo ya facturado
    throw error;
  }
}

/** Recalcula subtotal/impuestos/total desde las líneas guardadas. */
export async function recalculateInvoice(tx: DbOrTx, invoiceId: string): Promise<void> {
  const items = await tx
    .select({
      quantity: invoiceItems.quantity,
      unitPrice: invoiceItems.unitPrice,
      taxRate: invoiceItems.taxRate,
    })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));

  const totals = documentTotals(items);
  await tx
    .update(invoices)
    .set({ subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total })
    .where(eq(invoices.id, invoiceId));
}
