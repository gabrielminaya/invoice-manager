/**
 * Utilidades de fecha civil (YYYY-MM-DD).
 *
 * Las fechas de emisión y vencimiento son fechas de calendario, no instantes.
 * Toda la aritmética se hace en UTC sobre cadenas ISO para que un servidor en
 * otra zona horaria no desplace un día la facturación.
 */

export type ISODate = string; // YYYY-MM-DD

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  return typeof value === "string" && ISO_RE.test(value);
}

export function parseISO(value: ISODate): { y: number; m: number; d: number } {
  if (!isISODate(value)) throw new Error(`Fecha inválida: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}

export function toISO(y: number, m: number, d: number): ISODate {
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toISOString().slice(0, 10);
}

/** "Hoy" según una zona horaria IANA, sin depender de la zona del servidor. */
export function todayInTimeZone(timeZone = "America/Santo_Domingo"): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA ya devuelve YYYY-MM-DD
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISO(date);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/**
 * Suma meses conservando el día cuando existe y recortando al último día del
 * mes cuando no: 31 de enero + 1 mes = 28/29 de febrero.
 */
export function addMonths(date: ISODate, months: number, anchorDay?: number | null): ISODate {
  const { y, m, d } = parseISO(date);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const wanted = anchorDay && anchorDay > 0 ? anchorDay : d;
  return toISO(ty, tm, Math.min(wanted, daysInMonth(ty, tm)));
}

/** Compara dos fechas ISO. Negativo si a < b. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBeforeOrEqual(a: ISODate, b: ISODate): boolean {
  return a <= b;
}

export function diffInDays(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

/** Formato dominicano: 23-07-2026, igual que la factura de referencia. */
export function formatDateDO(date: ISODate | null | undefined): string {
  if (!date || !isISODate(date)) return "—";
  const { y, m, d } = parseISO(date);
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatDateLong(date: ISODate | null | undefined): string {
  if (!date || !isISODate(date)) return "—";
  const { y, m, d } = parseISO(date);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

export function formatMonthYear(date: ISODate): string {
  const { y, m } = parseISO(date);
  return `${MONTHS_ES[m - 1]} ${y}`;
}

/** Etiqueta relativa corta: "en 3 días", "hace 2 días", "hoy". */
export function relativeDayLabel(date: ISODate, today: ISODate): string {
  const days = diffInDays(today, date);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  if (days > 0) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
}
