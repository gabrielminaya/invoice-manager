import { describe, expect, it } from "vitest";
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";

describe("hashPassword", () => {
  it("nunca guarda la contraseña en claro", async () => {
    const hash = await hashPassword("Facturacion2026");
    expect(hash).not.toContain("Facturacion2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("incluye los parámetros de coste, para poder endurecerlos después", async () => {
    const [scheme, n, r, p, salt, digest] = (await hashPassword("Facturacion2026")).split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(16_384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt.length).toBeGreaterThan(10);
    expect(digest.length).toBeGreaterThan(40);
  });

  it("dos hashes de la misma contraseña son distintos", async () => {
    // Sal por usuario: sin ella, dos cuentas con la misma clave se delatarían.
    const a = await hashPassword("Facturacion2026");
    const b = await hashPassword("Facturacion2026");
    expect(a).not.toBe(b);
    expect(await verifyPassword("Facturacion2026", a)).toBe(true);
    expect(await verifyPassword("Facturacion2026", b)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("acepta la contraseña correcta y rechaza el resto", async () => {
    const hash = await hashPassword("Facturacion2026");
    expect(await verifyPassword("Facturacion2026", hash)).toBe(true);
    expect(await verifyPassword("facturacion2026", hash)).toBe(false);
    expect(await verifyPassword("Facturacion2027", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("devuelve false ante un hash corrupto en vez de lanzar", async () => {
    // Un registro dañado debe impedir el acceso, no tumbar la pantalla de login.
    for (const roto of ["", "basura", "scrypt$", "bcrypt$10$abc", "scrypt$x$y$z$a$b"]) {
      expect(await verifyPassword("Facturacion2026", roto)).toBe(false);
    }
  });
});

describe("needsRehash", () => {
  it("detecta parámetros por debajo de los actuales", async () => {
    expect(needsRehash(await hashPassword("Facturacion2026"))).toBe(false);
    expect(needsRehash("scrypt$1024$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    expect(needsRehash("bcrypt$10$loquesea")).toBe(true);
  });
});

describe("validatePasswordStrength", () => {
  it("acepta una contraseña razonable", () => {
    expect(validatePasswordStrength("Facturacion2026")).toBeNull();
  });

  it("exige longitud mínima", () => {
    expect(validatePasswordStrength("Corta123")).toMatch(
      new RegExp(`${MIN_PASSWORD_LENGTH} caracteres`),
    );
  });

  it("exige letras y números", () => {
    expect(validatePasswordStrength("solosonletras")).toMatch(/letras y números/);
    expect(validatePasswordStrength("1234567890123")).toMatch(/letras y números/);
  });
});
