import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
  paymentMethodOptions,
} from "@/lib/payment-methods";

describe("formas de pago", () => {
  it("la primera es la genérica de la factura de referencia", () => {
    expect(PAYMENT_METHODS[0]).toBe("Por defecto");
    expect(DEFAULT_PAYMENT_METHOD).toBe("Por defecto");
  });

  it("incluye las formas de cobro habituales", () => {
    expect(PAYMENT_METHODS).toContain("Efectivo");
    expect(PAYMENT_METHODS).toContain("Transferencia");
    expect(PAYMENT_METHODS).toContain("Cheque");
  });

  it("sin valor previo devuelve la lista canónica", () => {
    expect(paymentMethodOptions()).toEqual([...PAYMENT_METHODS]);
    expect(paymentMethodOptions(null)).toEqual([...PAYMENT_METHODS]);
    expect(paymentMethodOptions("  ")).toEqual([...PAYMENT_METHODS]);
  });

  it("no duplica un valor que ya está en la lista", () => {
    const opciones = paymentMethodOptions("Transferencia");
    expect(opciones).toEqual([...PAYMENT_METHODS]);
    expect(opciones.filter((o) => o === "Transferencia")).toHaveLength(1);
  });

  it("añade delante un valor personalizado ya guardado", () => {
    // Si no, editar un registro con una forma de pago antigua la cambiaría en
    // silencio por la primera opción del desplegable.
    const opciones = paymentMethodOptions("Pago móvil tPago");
    expect(opciones[0]).toBe("Pago móvil tPago");
    expect(opciones).toHaveLength(PAYMENT_METHODS.length + 1);
  });
});
