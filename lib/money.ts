import type { Currency } from "@/lib/db/schema";

/**
 * Toda la aritmética de dinero se hace en centavos (entero) para no acumular
 * error de coma flotante. Las columnas de Postgres son numeric(14,2), así que
 * solo hay que redondear a centavos antes de escribir.
 */

export function toCents(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Redondea un importe a 2 decimales. */
export function money(amount: number): number {
  return fromCents(toCents(amount));
}

export const CURRENCY_LABEL: Record<Currency, string> = {
  DOP: "Peso dominicano",
  USD: "Dólar estadounidense",
  EUR: "Euro",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  DOP: "RD$",
  USD: "US$",
  EUR: "€",
};

/** Formato numérico de la factura: 1,234.56 (sin símbolo, como en el PDF). */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(money(amount));
}

/** Formato con símbolo, para listados y tarjetas. */
export function formatMoney(amount: number, currency: Currency): string {
  return `${CURRENCY_SYMBOL[currency]} ${formatAmount(amount)}`;
}

export type TotalsInput = {
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export type LineTotals = {
  netCents: number;
  taxCents: number;
};

/**
 * Neto de una línea = cantidad * precio unitario.
 * La cantidad admite 4 decimales (horas, fracciones), por eso se multiplica
 * en centavos y se redondea una sola vez.
 */
export function lineTotals(item: TotalsInput): LineTotals {
  const netCents = Math.round(toCents(item.unitPrice) * (Number(item.quantity) || 0));
  const taxCents = Math.round((netCents * (Number(item.taxRate) || 0)) / 100);
  return { netCents, taxCents };
}

export type DocumentTotals = {
  subtotal: number;
  taxTotal: number;
  total: number;
};

/** Suma las líneas en centavos y devuelve importes ya redondeados. */
export function documentTotals(items: TotalsInput[]): DocumentTotals {
  let subtotalCents = 0;
  let taxCents = 0;
  for (const item of items) {
    const line = lineTotals(item);
    subtotalCents += line.netCents;
    taxCents += line.taxCents;
  }
  return {
    subtotal: fromCents(subtotalCents),
    taxTotal: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}
