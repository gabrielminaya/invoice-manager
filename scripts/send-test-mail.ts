/**
 * Envía un correo de prueba con el proveedor configurado.
 *
 *   pnpm mail:test -- tu@correo.com
 *
 * Sirve para comprobar de una vez que la clave de Resend funciona, que el
 * dominio del remitente está verificado y que el correo llega con buen aspecto.
 * Si no hay clave, sale por el proveedor simulado y lo imprime en la consola.
 */
import { describeMailConfig, sendMail, toRecipients } from "@/lib/mail";
import { templates } from "@/lib/mail";
import { todayInTimeZone } from "@/lib/dates";

async function main() {
  const recipient = process.argv.slice(2).find((arg) => arg.includes("@"));

  if (!recipient) {
    console.error("Uso: pnpm mail:test -- tu@correo.com");
    process.exit(1);
  }

  const config = describeMailConfig();
  console.log(`Proveedor: ${config.provider}${config.autoDetected ? " (detectado)" : ""}`);
  console.log(`Remitente: ${config.from ?? "(sin MAIL_FROM)"}`);
  for (const problem of config.problems) console.log(`  aviso: ${problem}`);
  console.log("");

  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");

  // Se usa la plantilla real de factura emitida para ver exactamente lo que
  // recibirá un cliente, no un "hola mundo".
  const result = await sendMail({
    to: toRecipients(recipient),
    ...templates.invoiceIssued({
      number: "FAC000TEST",
      clientName: "Cliente de prueba",
      companyName: process.env.MAIL_FROM?.split("<")[0].trim() || "Tu compañía",
      issueDate: today,
      dueDate: today,
      total: 1234.56,
      currency: "DOP",
      status: "issued",
      url: process.env.APP_URL ? `${process.env.APP_URL}/invoices` : undefined,
      periodLabel: "correo de prueba",
    }),
    // Clave única por ejecución: si no, Resend descartaría el segundo intento.
    idempotencyKey: `test-${Date.now()}`,
  });

  if (result.ok && result.skipped) {
    console.log(`Envío omitido (${result.reason}).`);
    return;
  }

  if (result.ok) {
    console.log(`Enviado con ${result.provider}. Id: ${result.id}`);
    return;
  }

  console.error(`Falló el envío con ${result.provider}:`);
  console.error(`  ${result.error}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
