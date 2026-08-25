"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { documentTotals, formatAmount, lineTotals, fromCents } from "@/lib/money";
import { CURRENCY_SYMBOL } from "@/lib/money";
import type { Currency } from "@/lib/db/schema";

export type EditableLine = {
  key: string;
  reference: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export type InitialLine = {
  reference?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

let counter = 0;
const nextKey = () => `line-${(counter += 1)}`;

function emptyLine(taxRate: number): EditableLine {
  return {
    key: nextKey(),
    reference: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    taxRate: String(taxRate),
  };
}

function toEditable(line: InitialLine): EditableLine {
  return {
    key: nextKey(),
    reference: line.reference ?? "",
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
    taxRate: String(line.taxRate),
  };
}

const num = (value: string) => Number(value.replace(",", ".")) || 0;

const CELL =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[0.9375rem] text-ink tabular outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

/**
 * Editor de conceptos de la factura.
 *
 * Los campos se envían como listas paralelas (`lineDescription`, `lineQuantity`,
 * …) que `lib/form.ts` vuelve a emparejar por índice. Así el formulario sigue
 * siendo un formulario HTML normal y funciona aunque falle la hidratación.
 */
export function LineItemsEditor({
  initialLines,
  defaultTaxRate,
  currency,
}: {
  initialLines?: InitialLine[];
  defaultTaxRate: number;
  currency: Currency;
}) {
  const [lines, setLines] = useState<EditableLine[]>(() =>
    initialLines?.length ? initialLines.map(toEditable) : [emptyLine(defaultTaxRate)],
  );

  function update(key: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function remove(key: string) {
    setLines((current) =>
      current.length === 1 ? [emptyLine(defaultTaxRate)] : current.filter((l) => l.key !== key),
    );
  }

  const parsed = lines.map((line) => ({
    quantity: num(line.quantity),
    unitPrice: num(line.unitPrice),
    taxRate: num(line.taxRate),
  }));
  const totals = documentTotals(parsed);
  const symbol = CURRENCY_SYMBOL[currency];

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        const net = fromCents(lineTotals(parsed[index]).netCents);

        return (
          <div
            key={line.key}
            className="space-y-2.5 rounded-xl border border-line bg-surface-2 p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">
                {index + 1}
              </span>
              <input
                name="lineReference"
                value={line.reference}
                onChange={(e) => update(line.key, { reference: e.target.value })}
                placeholder="Referencia"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-faint outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => remove(line.key)}
                aria-label={`Quitar concepto ${index + 1}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>

            <input
              name="lineDescription"
              value={line.description}
              onChange={(e) => update(line.key, { description: e.target.value })}
              placeholder="Descripción del concepto"
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[0.9375rem] text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="block text-[0.6875rem] font-medium uppercase tracking-wide text-faint">
                  Cantidad
                </span>
                <input
                  name="lineQuantity"
                  value={line.quantity}
                  onChange={(e) => update(line.key, { quantity: e.target.value })}
                  inputMode="decimal"
                  className={CELL}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[0.6875rem] font-medium uppercase tracking-wide text-faint">
                  Precio
                </span>
                <input
                  name="lineUnitPrice"
                  value={line.unitPrice}
                  onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={CELL}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[0.6875rem] font-medium uppercase tracking-wide text-faint">
                  ITBIS %
                </span>
                <input
                  name="lineTaxRate"
                  value={line.taxRate}
                  onChange={(e) => update(line.key, { taxRate: e.target.value })}
                  inputMode="decimal"
                  className={CELL}
                />
              </label>
            </div>

            <p className="text-right text-[0.8125rem] text-muted">
              Neto <span className="tabular font-medium text-ink">{formatAmount(net)}</span>
            </p>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setLines((current) => [...current, emptyLine(defaultTaxRate)])}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[0.9375rem] font-medium text-accent-text transition-colors hover:bg-accent-soft"
      >
        <Icon name="plus" size={18} />
        Añadir concepto
      </button>

      <dl className="space-y-1 rounded-xl bg-surface-2 p-3.5 text-[0.9375rem]">
        <div className="flex justify-between">
          <dt className="text-muted">Neto</dt>
          <dd className="tabular text-ink">
            {symbol} {formatAmount(totals.subtotal)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">ITBIS</dt>
          <dd className="tabular text-ink">
            {symbol} {formatAmount(totals.taxTotal)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
          <dt className="text-ink">Total</dt>
          <dd className="tabular text-ink">
            {symbol} {formatAmount(totals.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
