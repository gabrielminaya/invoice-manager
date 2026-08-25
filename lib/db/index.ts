import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_URL } from "@/lib/env";
import * as schema from "./schema";

/**
 * En desarrollo Next.js recarga los módulos en caliente, así que el pool se
 * guarda en globalThis para no abrir una conexión nueva en cada recarga.
 */
const globalForDb = globalThis as unknown as {
  __invoicePool?: ReturnType<typeof postgres>;
  __invoiceDb?: ReturnType<typeof createDb>;
};

function createPool() {
  return postgres(DATABASE_URL(), {
    max: process.env.NODE_ENV === "production" ? 10 : 3,
    idle_timeout: 20,
    // Las fechas se manejan como texto ISO (YYYY-MM-DD) para evitar
    // corrimientos por zona horaria en fechas de emisión y vencimiento.
    types: {
      date: {
        to: 1184,
        from: [1082],
        serialize: (x: string | Date) =>
          x instanceof Date ? x.toISOString().slice(0, 10) : x,
        parse: (x: string) => x,
      },
    },
  });
}

function createDb(pool: ReturnType<typeof postgres>) {
  return drizzle(pool, { schema, casing: "snake_case" });
}

function getPool(): ReturnType<typeof postgres> {
  globalForDb.__invoicePool ??= createPool();
  return globalForDb.__invoicePool;
}

function getDb(): ReturnType<typeof createDb> {
  globalForDb.__invoiceDb ??= createDb(getPool());
  return globalForDb.__invoiceDb;
}

/**
 * La conexión se abre en la primera consulta, no al importar el módulo.
 *
 * `next build` importa todas las páginas para recopilar sus metadatos. Con un
 * pool creado al importar, compilar exigiría un `DATABASE_URL` válido —y en una
 * imagen de Docker eso significaría meter credenciales de producción en el
 * build—. Con el acceso diferido, la compilación no necesita base de datos.
 *
 * Se usa un Proxy porque `sql` de postgres.js es a la vez función invocable
 * (plantilla etiquetada) y objeto con métodos (`end`, `unsafe`, `begin`).
 */
export const sql = new Proxy(function () {} as unknown as ReturnType<typeof postgres>, {
  apply: (_target, _thisArg, args: unknown[]) =>
    (getPool() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, property) => getPool()[property as keyof ReturnType<typeof postgres>],
  has: (_target, property) => property in getPool(),
});

export type Database = ReturnType<typeof createDb>;

/** Cliente de Drizzle, también diferido. */
export const db = new Proxy({} as Database, {
  get: (_target, property) => getDb()[property as keyof Database],
  has: (_target, property) => property in getDb(),
});

/** Transacción de Drizzle: mismo API que `db` pero atada a la transacción. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Cualquier ejecutor de consultas. Permite escribir servicios que funcionan
 * igual dentro o fuera de una transacción.
 */
export type DbOrTx = Database | Transaction;

export { schema };
