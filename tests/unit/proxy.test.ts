import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const BASE = "https://facturas.example.com";

function peticion(path: string, opciones: { conSesion?: boolean } = {}) {
  const request = new NextRequest(`${BASE}${path}`);
  if (opciones.conSesion) {
    request.cookies.set(SESSION_COOKIE, "token-de-prueba");
  }
  return request;
}

/** Destino del redirect, o null si dejó pasar la petición. */
function destino(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname + new URL(location).search : null;
}

describe("proxy: comprobación optimista de sesión", () => {
  it("manda al login las rutas protegidas sin cookie", () => {
    expect(destino(proxy(peticion("/")))).toBe("/login");
    expect(destino(proxy(peticion("/invoices")))).toBe("/login?redirectTo=%2Finvoices");
    expect(destino(proxy(peticion("/settings")))).toBe("/login?redirectTo=%2Fsettings");
  });

  it("recuerda el destino, incluida la query", () => {
    expect(destino(proxy(peticion("/invoices?filter=overdue")))).toBe(
      "/login?redirectTo=%2Finvoices%3Ffilter%3Doverdue",
    );
  });

  it("no añade redirectTo para la raíz", () => {
    // Volver a la raíz es el comportamiento por defecto tras iniciar sesión.
    expect(destino(proxy(peticion("/")))).toBe("/login");
  });

  it("deja pasar con cookie de sesión", () => {
    expect(destino(proxy(peticion("/", { conSesion: true })))).toBeNull();
    expect(destino(proxy(peticion("/invoices/abc", { conSesion: true })))).toBeNull();
  });

  it("deja pasar las rutas públicas sin sesión", () => {
    for (const ruta of ["/login", "/setup", "/offline"]) {
      expect(destino(proxy(peticion(ruta)))).toBeNull();
    }
  });

  it("no toca el endpoint del cron: se autentica con CRON_SECRET", () => {
    expect(destino(proxy(peticion("/api/cron/recurring")))).toBeNull();
  });

  it("una ruta que empieza igual que una pública no se cuela", () => {
    // /setupmalicioso no debe considerarse pública.
    expect(destino(proxy(peticion("/setupmalicioso")))).toBe(
      "/login?redirectTo=%2Fsetupmalicioso",
    );
  });
});
