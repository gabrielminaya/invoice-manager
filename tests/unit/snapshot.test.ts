import { describe, expect, it } from "vitest";
import { withSnapshot } from "@/lib/snapshot";

/**
 * Fusión de la copia fiscal congelada sobre el registro vivo.
 *
 * El caso delicado son los nulos: un campo que no existía cuando se emitió la
 * factura llega como `null` y no debe borrar el valor actual.
 */
describe("withSnapshot", () => {
  const vivo = {
    name: "Neurosoft",
    rnc: "131-00000-1",
    addressLine: "Dirección nueva",
    city: "Santiago",
  };

  it("la copia manda sobre el registro vivo", () => {
    const resultado = withSnapshot(vivo, { addressLine: "Dirección de cuando se emitió" });
    expect(resultado.addressLine).toBe("Dirección de cuando se emitió");
    // Lo que la copia no trae se mantiene.
    expect(resultado.city).toBe("Santiago");
  });

  it("un nulo en la copia no borra el valor vivo", () => {
    // Este era el fallo: `{...vivo, ...copia}` dejaba que el null ganara.
    const resultado = withSnapshot(vivo, { addressLine: null, rnc: undefined });
    expect(resultado.addressLine).toBe("Dirección nueva");
    expect(resultado.rnc).toBe("131-00000-1");
  });

  it("sin copia devuelve el registro vivo tal cual", () => {
    expect(withSnapshot(vivo, null)).toEqual(vivo);
    expect(withSnapshot(vivo, undefined)).toEqual(vivo);
  });

  it("ignora una copia que no es un objeto", () => {
    expect(withSnapshot(vivo, "corrupto")).toEqual(vivo);
    expect(withSnapshot(vivo, 42)).toEqual(vivo);
  });

  it("no muta el registro vivo", () => {
    const original = { ...vivo };
    withSnapshot(vivo, { city: "Santo Domingo" });
    expect(vivo).toEqual(original);
  });

  it("conserva los valores vacíos que sí son intencionados", () => {
    // Una cadena vacía o un 0 son datos, no ausencia de dato.
    const resultado = withSnapshot({ ...vivo, taxRate: 18 }, { addressLine: "", taxRate: 0 });
    expect(resultado.addressLine).toBe("");
    expect(resultado.taxRate).toBe(0);
  });
});
