import { eq, sql as raw } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { companies } from "@/lib/db/schema";

export type IssuedNumber = {
  /** Número visible de la factura, p.ej. "FAC0010A7". */
  number: string;
  /** Serie fiscal, p.ej. "General". */
  series: string;
  /** Correlativo dentro de la serie: el "Número: 7" del documento. */
  seriesNumber: number;
};

/**
 * Formatea el número visible a partir del contador global de documentos.
 *
 * La factura de referencia (FAC0010A7, serie General, número 7) codifica el
 * contador interno de documentos en hexadecimal de 6 dígitos: 4263 -> 10A7 ->
 * "0010A7". Se mantiene ese formato por defecto y se ofrece `decimal` para
 * quien prefiera un correlativo legible.
 */
export function formatInvoiceNumber(
  prefix: string,
  docCounter: number,
  format: "hex" | "decimal",
): string {
  const body =
    format === "hex"
      ? docCounter.toString(16).toUpperCase().padStart(6, "0")
      : docCounter.toString(10).padStart(6, "0");
  return `${prefix}${body}`;
}

/**
 * Reserva el siguiente número de factura de una compañía.
 *
 * Debe ejecutarse dentro de una transacción: bloquea la fila de la compañía con
 * `FOR UPDATE` para que dos emisiones simultáneas (por ejemplo el cronjob y un
 * usuario guardando una factura) no puedan tomar el mismo correlativo.
 */
export async function reserveInvoiceNumber(tx: DbOrTx, companyId: string): Promise<IssuedNumber> {
  const locked = await tx
    .select({
      prefix: companies.invoicePrefix,
      series: companies.invoiceSeries,
      docCounter: companies.docCounter,
      seriesCounter: companies.seriesCounter,
      numberFormat: companies.numberFormat,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .for("update")
    .limit(1);

  const company = locked[0];
  if (!company) throw new Error(`No existe la compañía ${companyId}`);

  const docCounter = company.docCounter + 1;
  const seriesNumber = company.seriesCounter + 1;

  await tx
    .update(companies)
    .set({ docCounter, seriesCounter: seriesNumber, updatedAt: raw`now()` })
    .where(eq(companies.id, companyId));

  return {
    number: formatInvoiceNumber(company.prefix, docCounter, company.numberFormat),
    series: company.series,
    seriesNumber,
  };
}
