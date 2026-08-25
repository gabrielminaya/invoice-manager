// Efecto de importación: carga .env.local cuando el proceso no es Next
// (scripts con tsx, cron por CLI). Sin esto, MAIL_FROM y RESEND_API_KEY
// quedarían indefinidos fuera del servidor de Next.
import "@/lib/env";
import { resolveProvider } from "@/lib/mail/providers";
import type { MailAddress, MailMessage, MailResult } from "@/lib/mail/types";

export * from "@/lib/mail/types";
export { readOutbox, clearOutbox } from "@/lib/mail/providers/mock";
export { describeMailConfig, type MailConfig } from "@/lib/mail/providers";
export * as templates from "@/lib/mail/templates";

/** Remitente por defecto, configurable con MAIL_FROM. */
function defaultFrom(): MailAddress {
  const raw = process.env.MAIL_FROM ?? "Facturación <facturacion@example.com>";
  return parseAddress(raw);
}

/** Acepta `"Nombre <correo@dominio>"` o `"correo@dominio"`. */
export function parseAddress(raw: string): MailAddress {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: raw.trim() };
}

/**
 * Separa una lista escrita a mano —`"pagos@x.do, Ana <ana@x.do>"`— en
 * direcciones. Acepta comas, punto y coma y saltos de línea como separador,
 * que es como se guardan los CC de clientes y compañías.
 */
export function parseAddressList(raw: string | null | undefined): MailAddress[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseAddress);
}

/**
 * Quita direcciones repetidas y las que ya estén en `exclude`.
 *
 * Sirve para que nadie reciba el mismo correo dos veces cuando el CC del
 * cliente coincide con su destinatario principal o con el de la compañía.
 */
export function dedupeAddresses(
  addresses: MailAddress[],
  exclude: MailAddress[] = [],
): MailAddress[] {
  const seen = new Set(exclude.map((address) => address.email.toLowerCase()));
  const unique: MailAddress[] = [];

  for (const address of addresses) {
    const key = address.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }

  return unique;
}

export function toRecipients(input: string | string[] | MailAddress[]): MailAddress[] {
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === "string" ? parseAddress(item) : item));
  }
  return [parseAddress(input)];
}

/**
 * Envía un correo con el proveedor configurado.
 *
 * **Nunca lanza.** Un fallo de correo no debe tumbar la emisión de una factura
 * ni una corrida del cronjob, así que los errores vuelven en el resultado y
 * quien llama decide si le importan.
 *
 * Se omite el envío —sin error— cuando no hay destinatario o cuando
 * `MAIL_ENABLED=false`, para que un entorno de pruebas no moleste a clientes
 * reales.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = resolveProvider();

  if (message.to.length === 0) {
    return { ok: true, id: null, provider: provider.name, skipped: true, reason: "sin destinatario" };
  }

  if (process.env.MAIL_ENABLED === "false") {
    return {
      ok: true,
      id: null,
      provider: provider.name,
      skipped: true,
      reason: "envío deshabilitado por MAIL_ENABLED=false",
    };
  }

  const replyTo =
    message.replyTo ?? (process.env.MAIL_REPLY_TO ? parseAddress(process.env.MAIL_REPLY_TO) : undefined);

  try {
    return await provider.send({
      ...message,
      from: message.from ?? defaultFrom(),
      replyTo,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[mail] fallo enviando "${message.subject}":`, detail);
    return { ok: false, provider: provider.name, error: detail };
  }
}
