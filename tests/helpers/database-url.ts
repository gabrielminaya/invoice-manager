// Efecto de importación: carga .env.local. Hace falta aquí porque el
// globalSetup de Vitest corre fuera de Next y sin esto DATABASE_URL llegaría
// vacía, derivando una URL de pruebas equivocada.
import "@/lib/env";

/**
 * URL de la base de datos de pruebas.
 *
 * Se usa TEST_DATABASE_URL si existe; si no, se deriva de DATABASE_URL
 * añadiendo el sufijo `_test`. Derivarla evita el accidente clásico de correr
 * la suite —que trunca tablas— contra la base de desarrollo.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    // Valor por defecto razonable para un Postgres local; si no responde, las
    // pruebas de integración se omiten en lugar de fallar.
    return "postgresql://postgres:postgres@localhost:5432/invoices_test";
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "") || "postgres";
  if (name.endsWith("_test")) return base;
  url.pathname = `/${name}_test`;
  return url.toString();
}

/** Nombre de la base de datos dentro de una URL de conexión. */
export function databaseName(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, "");
}

/** La misma URL apuntando a la base `postgres`, para poder crear la de pruebas. */
export function adminUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}
