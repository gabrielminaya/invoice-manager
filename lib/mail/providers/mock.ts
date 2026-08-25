import type { MailMessage, MailProvider, MailResult } from "@/lib/mail/types";

/** Correos "enviados" en el proceso actual. Solo para inspección en desarrollo. */
const outbox: (MailMessage & { sentAt: Date; id: string })[] = [];

/** Últimos correos simulados, del más reciente al más antiguo. */
export function readOutbox(limit = 50) {
  return outbox.slice(-limit).reverse();
}

export function clearOutbox() {
  outbox.length = 0;
}

let counter = 0;

/**
 * Proveedor simulado: no sale nada de la máquina.
 *
 * Registra en consola un resumen legible del correo y lo guarda en una bandeja
 * en memoria. Sirve para desarrollar y probar todo el flujo —plantillas,
 * destinatarios, momentos de envío— antes de contratar un proveedor real.
 *
 * La bandeja es en memoria a propósito: en producción no debe usarse este
 * proveedor, y así no crea la ilusión de ser un registro persistente.
 */
export const mockProvider: MailProvider = {
  name: "mock",

  async send(message): Promise<MailResult> {
    const id = `mock-${Date.now().toString(36)}-${(counter += 1)}`;
    outbox.push({ ...message, sentAt: new Date(), id });

    const recipients = message.to.map(formatAddress).join(", ");
    console.info(
      [
        "",
        "┌─ correo simulado ─────────────────────────────────────",
        `│ de:      ${formatAddress(message.from)}`,
        `│ para:    ${recipients}`,
        message.cc?.length ? `│ cc:      ${message.cc.map(formatAddress).join(", ")}` : null,
        `│ asunto:  ${message.subject}`,
        message.idempotencyKey ? `│ clave:   ${message.idempotencyKey}` : null,
        message.attachments?.length
          ? `│ adjuntos: ${message.attachments.map((a) => a.filename).join(", ")}`
          : null,
        "├───────────────────────────────────────────────────────",
        ...message.text.split("\n").map((line) => `│ ${line}`),
        "└───────────────────────────────────────────────────────",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return { ok: true, id, provider: "mock" };
  },
};

function formatAddress(address: { email: string; name?: string }): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}
