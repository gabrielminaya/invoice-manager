import { and, eq, lt, lte, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, invoices, subscriptions } from "@/lib/db/schema";
import { todayInTimeZone, type ISODate } from "@/lib/dates";
import { dueOccurrences } from "@/lib/recurrence";
import { issueOccurrence } from "@/lib/services/invoices";
import { notifyInvoiceIssued } from "@/lib/services/notifications";

export type RunOptions = {
  /** Fecha lógica de corte. Por defecto hoy en CRON_TIMEZONE. */
  asOf?: ISODate;
  /** Simula sin escribir facturas: útil para revisar qué haría el cron. */
  dryRun?: boolean;
  /** Tope de ciclos atrasados que se recuperan por suscripción en una corrida. */
  limitPerSubscription?: number;
  /** Procesar una sola recurrencia (emisión manual desde la UI). */
  subscriptionId?: string;
  /** Origen de la llamada, se guarda en la bitácora. */
  triggeredBy?: string;
};

export type SubscriptionOutcome = {
  subscriptionId: string;
  subscriptionName: string;
  clientId: string;
  status: "created" | "skipped" | "error";
  /** Facturas emitidas en esta corrida. */
  invoices: { id: string; number: string; issueDate: ISODate; total: number }[];
  /** Ciclos que estaban ya facturados y se ignoraron. */
  alreadyBilled: string[];
  message?: string;
};

export type RunResult = {
  runId: string | null;
  asOf: ISODate;
  dryRun: boolean;
  scanned: number;
  created: number;
  skipped: number;
  errors: number;
  markedOverdue: number;
  /** Avisos de factura enviados al cliente. */
  emailsSent: number;
  /** Avisos que el proveedor rechazó. No afectan a la emisión. */
  emailsFailed: number;
  durationMs: number;
  results: SubscriptionOutcome[];
};

/**
 * Motor de facturación recurrente. Es el único lugar que decide qué se factura.
 *
 * Lo invocan el endpoint del cronjob y el botón "emitir ahora" de la UI, de
 * modo que ambos caminos comparten exactamente las mismas reglas.
 *
 * Garantías:
 * - Idempotente: cada ciclo tiene una clave de período con índice único, así que
 *   repetir la corrida (o solaparla) no duplica facturas.
 * - Recupera atrasos: si el cron no corrió durante meses, emite los ciclos
 *   pendientes en orden, hasta `limitPerSubscription` por corrida.
 * - Aislada por suscripción: un error en una no detiene a las demás.
 */
export async function runRecurringBilling(options: RunOptions = {}): Promise<RunResult> {
  const startedAt = Date.now();
  const asOf = options.asOf ?? todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");
  const dryRun = options.dryRun ?? false;
  const limitPerSubscription = options.limitPerSubscription ?? 12;

  const [run] = await db
    .insert(cronRuns)
    .values({ asOfDate: asOf, dryRun, triggeredBy: options.triggeredBy ?? "unknown" })
    .returning({ id: cronRuns.id });

  const pending = await db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      clientId: subscriptions.clientId,
      nextRunDate: subscriptions.nextRunDate,
      interval: subscriptions.interval,
      intervalCount: subscriptions.intervalCount,
      anchorDay: subscriptions.anchorDay,
      endDate: subscriptions.endDate,
      maxOccurrences: subscriptions.maxOccurrences,
      occurrences: subscriptions.occurrences,
    })
    .from(subscriptions)
    .where(
      options.subscriptionId
        ? and(eq(subscriptions.status, "active"), eq(subscriptions.id, options.subscriptionId))
        : and(eq(subscriptions.status, "active"), lte(subscriptions.nextRunDate, asOf)),
    )
    .orderBy(subscriptions.nextRunDate);

  const results: SubscriptionOutcome[] = [];
  let created = 0;
  let skipped = 0;
  let errors = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const sub of pending) {
    const occurrences = dueOccurrences(sub, asOf, limitPerSubscription);
    const outcome: SubscriptionOutcome = {
      subscriptionId: sub.id,
      subscriptionName: sub.name,
      clientId: sub.clientId,
      status: "skipped",
      invoices: [],
      alreadyBilled: [],
    };

    if (occurrences.length === 0) {
      outcome.message = "Sin ciclos vencidos";
      skipped += 1;
      results.push(outcome);
      continue;
    }

    if (dryRun) {
      outcome.status = "created";
      outcome.message = `Emitiría ${occurrences.length} factura(s)`;
      outcome.invoices = occurrences.map((occurrence) => ({
        id: "(simulado)",
        number: "(simulado)",
        issueDate: occurrence.scheduledDate,
        total: 0,
      }));
      created += occurrences.length;
      results.push(outcome);
      continue;
    }

    try {
      for (const occurrence of occurrences) {
        const generated = await issueOccurrence(sub.id, occurrence);
        if (!generated) {
          outcome.alreadyBilled.push(occurrence.periodKey);
          continue;
        }
        outcome.invoices.push({
          id: generated.invoice.id,
          number: generated.invoice.number,
          issueDate: generated.invoice.issueDate,
          total: generated.invoice.total,
        });

        // El aviso al cliente va después de confirmar la transacción y nunca
        // puede tumbar la corrida: `notifyInvoiceIssued` no lanza.
        if (generated.invoice.status === "issued") {
          const mail = await notifyInvoiceIssued(generated.invoice.id);
          if (!mail.ok) {
            emailsFailed += 1;
            console.warn(
              `[cron] no se pudo avisar de la factura ${generated.invoice.number}: ${mail.error}`,
            );
          } else if (!mail.skipped) {
            emailsSent += 1;
          }
        }
      }

      if (outcome.invoices.length > 0) {
        outcome.status = "created";
        created += outcome.invoices.length;
      } else {
        outcome.status = "skipped";
        outcome.message = "Todos los ciclos vencidos ya estaban facturados";
        skipped += 1;
      }
    } catch (error) {
      outcome.status = "error";
      outcome.message = error instanceof Error ? error.message : String(error);
      errors += 1;
    }

    results.push(outcome);
  }

  // Además de emitir, el cron pone en mora las facturas vencidas sin pagar.
  const markedOverdue = dryRun ? 0 : await markOverdueInvoices(asOf);

  const durationMs = Date.now() - startedAt;

  if (run) {
    await db
      .update(cronRuns)
      .set({
        finishedAt: raw`now()`,
        createdCount: created,
        skippedCount: skipped,
        errorCount: errors,
        details: { results, markedOverdue, emailsSent, emailsFailed, durationMs },
      })
      .where(eq(cronRuns.id, run.id));
  }

  return {
    runId: run?.id ?? null,
    asOf,
    dryRun,
    scanned: pending.length,
    created,
    skipped,
    errors,
    markedOverdue,
    emailsSent,
    emailsFailed,
    durationMs,
    results,
  };
}

/** Pasa a "overdue" las facturas emitidas cuyo vencimiento ya pasó y siguen sin cobrar. */
export async function markOverdueInvoices(asOf: ISODate): Promise<number> {
  const updated = await db
    .update(invoices)
    .set({ status: "overdue" })
    .where(
      and(
        eq(invoices.status, "issued"),
        lt(invoices.dueDate, asOf),
        lt(invoices.amountPaid, invoices.total),
      ),
    )
    .returning({ id: invoices.id });
  return updated.length;
}
