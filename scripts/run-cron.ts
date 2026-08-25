/**
 * Dispara la facturación recurrente desde la línea de comandos, sin pasar por
 * HTTP. Útil para probar y para servidores donde el cron del sistema prefiere
 * ejecutar un comando en vez de hacer una petición.
 *
 *   pnpm cron:run
 *   pnpm cron:run -- --as-of 2026-12-01 --dry-run
 */
import { sql } from "@/lib/db";
import { runRecurringBilling } from "@/lib/services/recurring";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "true";
}

async function main() {
  const result = await runRecurringBilling({
    asOf: flag("as-of"),
    dryRun: flag("dry-run") === "true",
    limitPerSubscription: flag("limit") ? Number(flag("limit")) : undefined,
    subscriptionId: flag("subscription"),
    triggeredBy: "cli",
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\n${result.dryRun ? "[simulación] " : ""}${result.created} factura(s), ` +
      `${result.skipped} omitida(s), ${result.errors} error(es), ` +
      `${result.markedOverdue} en mora, ${result.emailsSent} correo(s) — ${result.durationMs}ms`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
