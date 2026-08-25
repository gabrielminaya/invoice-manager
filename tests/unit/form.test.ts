import { describe, expect, it } from "vitest";
import * as f from "@/lib/form";

/** Construye un FormData a partir de pares, permitiendo claves repetidas. */
function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("campos obligatorios", () => {
  it("exige texto y avisa con el nombre del campo", () => {
    expect(() => f.text(form([]), "name", "El nombre")).toThrowError(
      /El nombre es obligatorio/,
    );
    expect(f.text(form([["name", "  Neurosoft  "]]), "name", "El nombre")).toBe("Neurosoft");
  });

  it("trata los espacios en blanco como vacío", () => {
    expect(() => f.text(form([["name", "   "]]), "name", "El nombre")).toThrow(
      f.ValidationError,
    );
    expect(f.optionalText(form([["rnc", "  "]]), "rnc")).toBeNull();
  });
});

describe("lista de correos en copia", () => {
  it("normaliza los separadores y conserva el nombre", () => {
    expect(
      f.optionalEmailList(
        form([["emailCc", "  pagos@cliente.do ;\n Ana <ana@cliente.do>  "]]),
        "emailCc",
        "El CC",
      ),
    ).toBe("pagos@cliente.do, Ana <ana@cliente.do>");
  });

  it("descarta repetidos sin distinguir mayúsculas", () => {
    expect(
      f.optionalEmailList(
        form([["emailCc", "pagos@cliente.do, PAGOS@Cliente.do"]]),
        "emailCc",
        "El CC",
      ),
    ).toBe("pagos@cliente.do");
  });

  it("vacío se guarda como null", () => {
    expect(f.optionalEmailList(form([["emailCc", " , ; "]]), "emailCc", "El CC")).toBeNull();
    expect(f.optionalEmailList(form([]), "emailCc", "El CC")).toBeNull();
  });

  it("rechaza una dirección mal escrita señalando cuál", () => {
    expect(() =>
      f.optionalEmailList(form([["emailCc", "ok@cliente.do, sin-arroba"]]), "emailCc", "El CC"),
    ).toThrowError(/"sin-arroba" no es una dirección de correo válida/);
  });
});

describe("números", () => {
  it("acepta la coma decimal", () => {
    expect(f.number(form([["taxRate", "18,50"]]), "taxRate", "El ITBIS")).toBe(18.5);
  });

  it("usa el valor por defecto cuando viene vacío", () => {
    expect(f.number(form([]), "taxRate", "El ITBIS", 0)).toBe(0);
  });

  it("rechaza lo que no es número", () => {
    expect(() => f.number(form([["taxRate", "mucho"]]), "taxRate", "El ITBIS")).toThrowError(
      /debe ser un número/,
    );
  });

  it("distingue vacío de cero en los opcionales", () => {
    expect(f.optionalNumber(form([]), "días", "Días")).toBeNull();
    expect(f.optionalNumber(form([["días", "0"]]), "días", "Días")).toBe(0);
  });

  it("trunca los enteros", () => {
    expect(f.integer(form([["n", "3.9"]]), "n", "N")).toBe(3);
  });
});

describe("fechas", () => {
  it("acepta solo formato ISO", () => {
    expect(f.date(form([["d", "2026-08-25"]]), "d", "La fecha")).toBe("2026-08-25");
    expect(() => f.date(form([["d", "25-08-2026"]]), "d", "La fecha")).toThrowError(
      /formato AAAA-MM-DD/,
    );
  });

  it("permite fecha vacía en los campos opcionales", () => {
    expect(f.optionalDate(form([]), "endDate", "El fin")).toBeNull();
  });
});

describe("booleanos y enumerados", () => {
  it("interpreta el 'on' de una casilla marcada", () => {
    expect(f.bool(form([["autoIssue", "on"]]), "autoIssue")).toBe(true);
    // Una casilla sin marcar no se envía.
    expect(f.bool(form([]), "autoIssue")).toBe(false);
  });

  it("valida contra los valores permitidos", () => {
    const permitidos = ["DOP", "USD", "EUR"] as const;
    expect(f.enumValue(form([["c", "USD"]]), "c", "La divisa", permitidos)).toBe("USD");
    expect(() =>
      f.enumValue(form([["c", "BTC"]]), "c", "La divisa", permitidos),
    ).toThrowError(/valor inválido/);
    expect(f.enumValue(form([]), "c", "La divisa", permitidos, "DOP")).toBe("DOP");
  });
});

describe("líneas de la factura", () => {
  it("empareja los campos paralelos por índice", () => {
    const data = form([
      ["lineReference", "SOP-001"],
      ["lineDescription", "Soporte mensual"],
      ["lineQuantity", "20"],
      ["lineUnitPrice", "1500"],
      ["lineTaxRate", "18"],
      ["lineReference", "HOST-01"],
      ["lineDescription", "Hosting"],
      ["lineQuantity", "1"],
      ["lineUnitPrice", "4500"],
      ["lineTaxRate", "18"],
    ]);

    expect(f.lines(data)).toEqual([
      { reference: "SOP-001", description: "Soporte mensual", quantity: 20, unitPrice: 1500, taxRate: 18 },
      { reference: "HOST-01", description: "Hosting", quantity: 1, unitPrice: 4500, taxRate: 18 },
    ]);
  });

  it("descarta las filas sin descripción sin desalinear las demás", () => {
    // El editor deja siempre una fila en blanco al final.
    const data = form([
      ["lineReference", ""],
      ["lineDescription", "Mantenimiento"],
      ["lineQuantity", "1"],
      ["lineUnitPrice", "75"],
      ["lineTaxRate", "0"],
      ["lineReference", ""],
      ["lineDescription", "   "],
      ["lineQuantity", "1"],
      ["lineUnitPrice", ""],
      ["lineTaxRate", "0"],
    ]);

    const lineas = f.lines(data);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ description: "Mantenimiento", unitPrice: 75, reference: null });
  });

  it("exige al menos un concepto", () => {
    expect(() => f.lines(form([]))).toThrowError(/al menos un concepto/);
  });

  it("rechaza cantidades y precios imposibles, citando el concepto", () => {
    const conCantidad = (q: string) =>
      form([
        ["lineDescription", "Servicio"],
        ["lineQuantity", q],
        ["lineUnitPrice", "10"],
        ["lineTaxRate", "0"],
      ]);

    expect(() => f.lines(conCantidad("0"))).toThrowError(/"Servicio".*mayor que cero/);
    expect(() => f.lines(conCantidad("-1"))).toThrowError(/mayor que cero/);

    expect(() =>
      f.lines(
        form([
          ["lineDescription", "Servicio"],
          ["lineQuantity", "1"],
          ["lineUnitPrice", "-5"],
          ["lineTaxRate", "0"],
        ]),
      ),
    ).toThrowError(/precio de "Servicio" no es válido/);
  });

  it("rechaza un ITBIS fuera de 0-100", () => {
    expect(() =>
      f.lines(
        form([
          ["lineDescription", "Servicio"],
          ["lineQuantity", "1"],
          ["lineUnitPrice", "10"],
          ["lineTaxRate", "120"],
        ]),
      ),
    ).toThrowError(/entre 0 y 100/);
  });

  it("hereda el ITBIS por defecto cuando la fila no lo trae", () => {
    const data = form([["lineDescription", "Servicio"], ["lineQuantity", "1"], ["lineUnitPrice", "10"]]);
    expect(f.lines(data, 18)[0].taxRate).toBe(18);
  });
});

describe("withValidation", () => {
  it("convierte un error de validación en estado del formulario", async () => {
    const estado = await f.withValidation(async () => {
      throw new f.ValidationError("Falta el cliente");
    });
    expect(estado).toEqual({ error: "Falta el cliente" });
  });

  it("devuelve ok cuando todo va bien", async () => {
    expect(await f.withValidation(async () => {})).toEqual({ ok: true });
  });

  it("deja pasar los errores inesperados, para no ocultar fallos reales", async () => {
    await expect(
      f.withValidation(async () => {
        throw new Error("la base de datos se cayó");
      }),
    ).rejects.toThrow(/base de datos/);
  });
});
