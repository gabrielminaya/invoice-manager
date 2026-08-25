/**
 * Aplica las migraciones pendientes antes de arrancar el servidor.
 *
 * Usa el migrador programático de drizzle-orm (no drizzle-kit, que es una
 * dependencia de desarrollo) leyendo los .sql y el journal de ./drizzle.
 *
 * En la imagen se incluye ya empaquetado en un único archivo, porque la salida
 * `standalone` de Next mete las dependencias dentro del bundle del servidor y
 * node_modules solo conserva next y react.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("[migrate] falta DATABASE_URL");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  connect_timeout: 15,
  // Los NOTICE de "ya existe" al reaplicar son esperados y solo hacen ruido.
  onnotice: () => {},
});

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("[migrate] esquema al día");
} catch (error) {
  console.error("[migrate] fallo al aplicar las migraciones:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
