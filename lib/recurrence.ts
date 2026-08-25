import type { RecurrenceInterval } from "@/lib/db/schema";
import { addDays, addMonths, compareISO, formatMonthYear, parseISO, type ISODate } from "@/lib/dates";

export const INTERVAL_LABEL: Record<RecurrenceInterval, string> = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
};

/** Meses que avanza cada intervalo. `weekly` se maneja aparte, en días. */
const INTERVAL_MONTHS: Record<Exclude<RecurrenceInterval, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export function intervalLabel(interval: RecurrenceInterval, count = 1): string {
  if (count <= 1) return INTERVAL_LABEL[interval];
  if (interval === "weekly") return `Cada ${count} semanas`;
  if (interval === "monthly") return `Cada ${count} meses`;
  if (interval === "yearly") return `Cada ${count} años`;
  return `${INTERVAL_LABEL[interval]} × ${count}`;
}

/**
 * Avanza una fecha un ciclo completo de la recurrencia.
 *
 * `anchorDay` mantiene el día del mes pactado: una suscripción anclada al 31
 * factura el 28 en febrero y vuelve al 31 en marzo, en lugar de irse
 * arrastrando hacia atrás.
 */
export function advance(
  date: ISODate,
  interval: RecurrenceInterval,
  intervalCount = 1,
  anchorDay?: number | null,
): ISODate {
  const count = Math.max(1, intervalCount || 1);
  if (interval === "weekly") return addDays(date, 7 * count);
  return addMonths(date, INTERVAL_MONTHS[interval] * count, anchorDay);
}

/**
 * Clave de idempotencia del período. Es la fecha programada de la emisión.
 *
 * Junto al índice único (subscription_id, period_key) garantiza que aunque el
 * cronjob se ejecute varias veces —o dos instancias a la vez— cada ciclo
 * produzca una sola factura.
 */
export function periodKey(scheduledDate: ISODate): string {
  return scheduledDate;
}

/** Ventana de servicio que cubre la factura: desde la emisión hasta el día previo al siguiente ciclo. */
export function periodRange(
  scheduledDate: ISODate,
  interval: RecurrenceInterval,
  intervalCount = 1,
  anchorDay?: number | null,
): { start: ISODate; end: ISODate } {
  const next = advance(scheduledDate, interval, intervalCount, anchorDay);
  return { start: scheduledDate, end: addDays(next, -1) };
}

/** Descripción legible del período, para añadirla al concepto de la factura. */
export function periodLabel(
  scheduledDate: ISODate,
  interval: RecurrenceInterval,
  intervalCount = 1,
): string {
  if (interval === "monthly" && intervalCount === 1) return formatMonthYear(scheduledDate);
  const { start, end } = periodRange(scheduledDate, interval, intervalCount);
  const s = parseISO(start);
  const e = parseISO(end);
  return `${String(s.d).padStart(2, "0")}/${String(s.m).padStart(2, "0")}/${s.y} - ${String(e.d).padStart(2, "0")}/${String(e.m).padStart(2, "0")}/${e.y}`;
}

/**
 * Día de anclaje implícito de una fecha de inicio: el día del mes para
 * intervalos mensuales o mayores, el día de la semana para semanales.
 */
export function inferAnchorDay(startDate: ISODate, interval: RecurrenceInterval): number {
  const { y, m, d } = parseISO(startDate);
  if (interval === "weekly") return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return d;
}

export type DueOccurrence = {
  scheduledDate: ISODate;
  periodKey: string;
  periodStart: ISODate;
  periodEnd: ISODate;
};

export type OccurrenceSource = {
  nextRunDate: ISODate;
  interval: RecurrenceInterval;
  intervalCount: number;
  anchorDay: number | null;
  endDate: ISODate | null;
  maxOccurrences: number | null;
  occurrences: number;
};

/**
 * Ciclos pendientes de facturar hasta `asOf` inclusive.
 *
 * Devuelve una lista porque una suscripción puede acumular varios ciclos si el
 * cronjob estuvo caído o si la suscripción se creó con fecha retroactiva.
 * `limit` evita que un `startDate` muy antiguo genere cientos de facturas de
 * golpe: se emiten por tandas en ejecuciones sucesivas.
 */
export function dueOccurrences(
  sub: OccurrenceSource,
  asOf: ISODate,
  limit = 12,
): DueOccurrence[] {
  const out: DueOccurrence[] = [];
  let cursor = sub.nextRunDate;
  let emitted = sub.occurrences;

  while (out.length < limit && compareISO(cursor, asOf) <= 0) {
    if (sub.endDate && compareISO(cursor, sub.endDate) > 0) break;
    if (sub.maxOccurrences != null && emitted >= sub.maxOccurrences) break;

    const { start, end } = periodRange(cursor, sub.interval, sub.intervalCount, sub.anchorDay);
    out.push({ scheduledDate: cursor, periodKey: periodKey(cursor), periodStart: start, periodEnd: end });

    emitted += 1;
    cursor = advance(cursor, sub.interval, sub.intervalCount, sub.anchorDay);
  }

  return out;
}

/** Estado terminal de la suscripción tras emitir un ciclo. */
export function resolveStatusAfterRun(
  sub: OccurrenceSource,
  nextDate: ISODate,
  occurrences: number,
): "active" | "finished" {
  if (sub.maxOccurrences != null && occurrences >= sub.maxOccurrences) return "finished";
  if (sub.endDate && compareISO(nextDate, sub.endDate) > 0) return "finished";
  return "active";
}
