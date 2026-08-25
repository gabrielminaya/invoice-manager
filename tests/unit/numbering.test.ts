import { describe, expect, it } from "vitest";
import { formatInvoiceNumber } from "@/lib/numbering";

describe("formatInvoiceNumber", () => {
  it("reproduce exactamente el número de la factura de referencia", () => {
    // 4263 en hexadecimal es 10A7, rellenado a 6 dígitos: FAC0010A7.
    expect(formatInvoiceNumber("FAC", 4263, "hex")).toBe("FAC0010A7");
  });

  it("continúa la serie en hexadecimal", () => {
    expect(formatInvoiceNumber("FAC", 4264, "hex")).toBe("FAC0010A8");
    expect(formatInvoiceNumber("FAC", 4272, "hex")).toBe("FAC0010B0");
  });

  it("usa mayúsculas y rellena a seis dígitos", () => {
    expect(formatInvoiceNumber("FAC", 1, "hex")).toBe("FAC000001");
    expect(formatInvoiceNumber("FAC", 255, "hex")).toBe("FAC0000FF");
  });

  it("admite formato decimal", () => {
    expect(formatInvoiceNumber("FAC", 4263, "decimal")).toBe("FAC004263");
    expect(formatInvoiceNumber("FAC", 1, "decimal")).toBe("FAC000001");
  });

  it("respeta el prefijo de cada compañía", () => {
    expect(formatInvoiceNumber("B01", 7, "decimal")).toBe("B01000007");
    expect(formatInvoiceNumber("", 7, "decimal")).toBe("000007");
  });

  it("no trunca cuando el contador supera seis dígitos", () => {
    expect(formatInvoiceNumber("FAC", 16_777_216, "hex")).toBe("FAC1000000");
  });

  it("es estrictamente creciente, así que nunca colisiona", () => {
    const numeros = Array.from({ length: 500 }, (_, i) =>
      formatInvoiceNumber("FAC", i + 1, "hex"),
    );
    expect(new Set(numeros).size).toBe(500);
  });
});
