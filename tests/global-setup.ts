import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { adminUrl, databaseName, testDatabaseUrl } from "./helpers/database-url";

/**
 * Crea la base de datos de pruebas y le aplica las migraciones, una sola vez
 * por ejecución de la suite.
 *
 * Si Postgres no está disponible no se falla: las pruebas de integración se
 * omiten solas (ver `describeWithDatabase`) y las unitarias siguen corriendo.
 * Así `pnpm test` funciona en una máquina sin base de datos.
 */
export default async function setup() {
  const url = testDatabaseUrl();
  const name = databaseName(url);

  let admin: ReturnType<typeof postgres> | undefined;
  try {
    admin = postgres(adminUrl(url), {
      max: 1,
      idle_timeout: 2,
      connect_timeout: 5,
      // Los NOTICE de "ya existe" son esperados al reejecutar la suite.
      onnotice: () => {},
    });
    const existing = await admin`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) {
      // No se puede parametrizar el nombre en CREATE DATABASE; viene de la
      // configuración local, no de una entrada del usuario.
      await admin.unsafe(`create database "${name.replace(/"/g, '""')}"`);
      console.info(`[tests] base de datos "${name}" creada`);
    }
  } catch (error) {
    console.warn(
      `[tests] Postgres no disponible (${
        error instanceof Error ? error.message : error
      }). Se omitirán las pruebas de integración.`,
    );
    return;
  } finally {
    await admin?.end({ timeout: 5 });
  }

  const client = postgres(url, { max: 1, idle_timeout: 2, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } catch (error) {
    console.warn(
      `[tests] no se pudieron aplicar las migraciones: ${
        error instanceof Error ? error.message : error
      }`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}
