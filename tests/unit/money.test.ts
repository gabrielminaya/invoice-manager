import { describe, expect, it } from "vitest";
import {
  CURRENCY_LABEL,
  documentTotals,
  formatAmount,
  formatMoney,
  fromCents,
  lineTotals,
  money,
  toCents,
} from "@/lib/money";

describe("conversión a centavos", () => {
  it("va y vuelve sin perder precisión", () => {
    expect(toCents(75)).toBe(7500);
    expect(toCents(0.07)).toBe(7);
    expect(toCents(1234.56)).toBe(123456);
    expect(fromCents(123456)).toBe(1234.56);
  });

  it("redondea a dos decimales", () => {
    expect(money(10.004)).toBe(10);
    expect(money(10.005)).toBe(10.01);
  });

  it("trata los valores no numéricos como cero", () => {
    expect(toCents(Number.NaN)).toBe(0);
  });
});

describe("lineTotals", () => {
  it("calcula el neto como cantidad × precio", () => {
    const { netCents, taxCents } = lineTotals({ quantity: 1, unitPrice: 75, taxRate: 0 });
    expect(fromCents(netCents)).toBe(75);
    expect(fromCents(taxCents)).toBe(0);
  });

  it("no acumula error de coma flotante", () => {
    // 3 × 0.1 en coma flotante da 0.30000000000000004; en centavos, 30.
    const { netCents } = lineTotals({ quantity: 3, unitPrice: 0.1, taxRate: 0 });
    expect(netCents).toBe(30);
    expect(fromCents(netCents)).toBe(0.3);
  });

  it("admite cantidades fraccionarias y redondea una sola vez", () => {
    // 1.5 × 33.33 = 49.995 -> 50.00
    const { netCents } = lineTotals({ quantity: 1.5, unitPrice: 33.33, taxRate: 0 });
    expect(fromCents(netCents)).toBe(50);
  });

  it("aplica el ITBIS sobre el neto", () => {
    const { netCents, taxCents } = lineTotals({ quantity: 20, unitPrice: 1500, taxRate: 18 });
    expect(fromCents(netCents)).toBe(30000);
    expect(fromCents(taxCents)).toBe(5400);
  });

  it("redondea el ITBIS al centavo", () => {
    // 75.00 × 18% = 13.5 exacto
    expect(fromCents(lineTotals({ quantity: 1, unitPrice: 75, taxRate: 18 }).taxCents)).toBe(13.5);
    // 0.05 × 18% = 0.009 -> 0.01
    expect(fromCents(lineTotals({ quantity: 1, unitPrice: 0.05, taxRate: 18 }).taxCents)).toBe(0.01);
  });
});

describe("documentTotals", () => {
  it("reproduce la factura de referencia (75.00 sin ITBIS)", () => {
    const totals = documentTotals([{ quantity: 1, unitPrice: 75, taxRate: 0 }]);
    expect(totals).toEqual({ subtotal: 75, taxTotal: 0, total: 75 });
  });

  it("suma varias líneas con ITBIS", () => {
    const totals = documentTotals([
      { quantity: 20, unitPrice: 1500, taxRate: 18 },
      { quantity: 1, unitPrice: 4500, taxRate: 18 },
    ]);
    expect(totals.subtotal).toBe(34500);
    expect(totals.taxTotal).toBe(6210);
    expect(totals.total).toBe(40710);
  });

  it("mantiene total = neto + impuestos con céntimos incómodos", () => {
    const totals = documentTotals([
      { quantity: 3, unitPrice: 0.1, taxRate: 18 },
      { quantity: 7, unitPrice: 0.01, taxRate: 18 },
    ]);
    expect(totals.total).toBe(money(totals.subtotal + totals.taxTotal));
  });

  it("devuelve ceros sin líneas", () => {
    expect(documentTotals([])).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
  });
});

describe("formato", () => {
  it("usa separador de miles y dos decimales", () => {
    expect(formatAmount(40710)).toBe("40,710.00");
    expect(formatAmount(75)).toBe("75.00");
  });

  it("antepone el símbolo de la divisa", () => {
    expect(formatMoney(75, "USD")).toBe("US$ 75.00");
    expect(formatMoney(40710, "DOP")).toBe("RD$ 40,710.00");
  });

  it("nombra la divisa como en la factura de referencia", () => {
    expect(CURRENCY_LABEL.USD).toBe("Dólar estadounidense");
  });
});
