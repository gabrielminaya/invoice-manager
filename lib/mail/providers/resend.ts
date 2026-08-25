import type { MailAddress, MailAttachment, MailProvider, MailResult } from "@/lib/mail/types";

/**
 * Proveedor de correo para Resend (https://resend.com).
 *
 * Habla directamente con la API REST mediante `fetch` en lugar de usar el SDK
 * `resend`: es una sola llamada HTTP, evita una dependencia más y funciona igual
 * en el runtime de Node y en el edge.
 *
 * Requisitos:
 *   - `RESEND_API_KEY` en el entorno (empieza por `re_`).
 *   - El dominio del remitente verificado en Resend. Mientras no lo verifiques,
 *     solo se puede enviar desde `onboarding@resend.dev` y a tu propio correo.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Intentos totales ante error temporal (429 o 5xx). */
const MAX_ATTEMPTS = 3;

export const resendProvider: MailProvider = {
  name: "resend",

  async send(message): Promise<MailResult> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        provider: "resend",
        error:
          "Falta RESEND_API_KEY. Créala en https://resend.com/api-keys y añádela al entorno.",
      };
    }

    const payload: Record<string, unknown> = {
      from: formatAddress(message.from),
      to: message.to.map(formatAddress),
      subject: message.subject,
      text: message.text,
    };

    if (message.html) payload.html = message.html;
    if (message.cc?.length) payload.cc = message.cc.map(formatAddress);
    if (message.bcc?.length) payload.bcc = message.bcc.map(formatAddress);
    if (message.replyTo) payload.reply_to = formatAddress(message.replyTo);
    if (message.attachments?.length) payload.attachments = message.attachments.map(toAttachment);

    const tags = toTags(message.tags);
    if (tags.length) payload.tags = tags;

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    };
    // Resend descarta el envío repetido con la misma clave durante 24 h, lo que
    // hace seguro reintentar una corrida del cron.
    if (message.idempotencyKey) {
      headers["idempotency-key"] = message.idempotencyKey.slice(0, 256);
    }

    let lastError = "error desconocido";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;

      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          // El cron no debe quedarse colgado si Resend no responde.
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_ATTEMPTS) break;
        await wait(backoffMs(attempt));
        continue;
      }

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { id?: string };
        return { ok: true, id: body.id ?? "(sin id)", provider: "resend" };
      }

      lastError = await describeError(response);

      // 429 y 5xx son temporales; el resto (401, 403, 422…) es configuración y
      // reintentar no ayuda.
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      await wait(retryAfterMs(response) ?? backoffMs(attempt));
    }

    return { ok: false, provider: "resend", error: lastError };
  },
};

function formatAddress(address: MailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function toAttachment(attachment: MailAttachment) {
  return {
    filename: attachment.filename,
    content: attachment.content,
    ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
  };
}

/**
 * Resend solo acepta letras, números, guiones y guiones bajos en las etiquetas,
 * así que se sanean en lugar de que la API rechace el envío completo.
 */
function toTags(tags: Record<string, string> | undefined) {
  if (!tags) return [];
  return Object.entries(tags).map(([name, value]) => ({
    name: sanitizeTag(name),
    value: sanitizeTag(value),
  }));
}

function sanitizeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

async function describeError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");

  try {
    const body = JSON.parse(raw) as { message?: string; name?: string };
    if (body.message) {
      return `${response.status} ${body.name ?? "error"}: ${body.message}`;
    }
  } catch {
    // el cuerpo no era JSON; se usa tal cual
  }

  return `${response.status} ${response.statusText}${raw ? `: ${raw.slice(0, 300)}` : ""}`;
}

/** Respeta `retry-after` cuando Resend indica cuánto esperar. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, 10_000);
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
