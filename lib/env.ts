/**
 * Carga de variables de entorno.
 *
 * Next.js ya carga `.env.local` por su cuenta, pero drizzle-kit y los scripts
 * ejecutados con `tsx` no lo hacen. `process.loadEnvFile` es nativo en Node 20.12+
 * y evita añadir `dotenv` como dependencia.
 */
function loadLocalEnvFile() {
  if (process.env.DATABASE_URL) return;
  if (typeof process.loadEnvFile !== "function") return;
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
      if (process.env.DATABASE_URL) return;
    } catch {
      // el archivo no existe; seguimos con el siguiente
    }
  }
}

loadLocalEnvFile();

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env.local y complétala.`,
    );
  }
  return value;
}

export const DATABASE_URL = () => requireEnv("DATABASE_URL");

/** Secreto compartido con el cronjob. Sin él, el endpoint de recurrencia rechaza todo. */
export const CRON_SECRET = () => process.env.CRON_SECRET ?? "";
