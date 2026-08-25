import { sql } from "@/lib/db";

/** Tablas que se vacían entre pruebas, en orden seguro para las claves ajenas. */
const TABLES = [
  "payments",
  "invoice_items",
  "invoices",
  "subscription_items",
  "subscriptions",
  "clients",
  "companies",
  "cron_runs",
  "sessions",
  "users",
];

let available: boolean | null = null;

/**
 * Comprueba una sola vez si la base de pruebas responde.
 *
 * Devolver `false` en lugar de lanzar es lo que permite que las pruebas de
 * integración se omitan solas —con `describe.skipIf`— en una máquina o un CI
 * sin Postgres, sin dejar la suite en rojo. `SKIP_DB_TESTS=true` las omite a
 * propósito.
 */
export async function databaseAvailable(): Promise<boolean> {
  if (process.env.SKIP_DB_TESTS === "true") return false;
  if (available !== null) return available;
  try {
    await sql`select 1`;
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/** Deja la base vacía. `restart identity` reinicia también las secuencias. */
export async function resetDatabase(): Promise<void> {
  await sql.unsafe(`truncate ${TABLES.join(", ")} restart identity cascade`);
}

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
