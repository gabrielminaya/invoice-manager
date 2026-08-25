import type { MailProvider } from "@/lib/mail/types";
import { mockProvider } from "@/lib/mail/providers/mock";
import { resendProvider } from "@/lib/mail/providers/resend";

/**
 * Proveedores de correo disponibles.
 *
 * Para añadir otro (SES, SendGrid, SMTP…), crea un archivo en esta carpeta que
 * exporte un `MailProvider` y regístralo en este mapa. Ni las plantillas ni los
 * puntos de envío necesitan cambios: todo está escrito contra la interfaz.
 */
const PROVIDERS: Record<string, MailProvider> = {
  mock: mockProvider,
  resend: resendProvider,
};

/**
 * Resuelve el proveedor activo.
 *
 * 1. `MAIL_PROVIDER` manda si está definido.
 * 2. Si no lo está pero hay `RESEND_API_KEY`, se usa Resend. Así basta con
 *    pegar la clave en el entorno para que los correos empiecen a salir.
 * 3. En cualquier otro caso, el proveedor simulado.
 */
export function resolveProvider(name?: string): MailProvider {
  const explicit = (name ?? process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();

  if (explicit) {
    const provider = PROVIDERS[explicit];
    if (provider) return provider;

    console.warn(
      `[mail] proveedor "${explicit}" no registrado; se usa el simulado. ` +
        `Disponibles: ${Object.keys(PROVIDERS).join(", ")}`,
    );
    return mockProvider;
  }

  if (process.env.RESEND_API_KEY) return resendProvider;

  return mockProvider;
}

export type MailConfig = {
  /** Proveedor que se usará realmente. */
  provider: string;
  /** true si se eligió por la presencia de RESEND_API_KEY y no por MAIL_PROVIDER. */
  autoDetected: boolean;
  from: string | null;
  replyTo: string | null;
  enabled: boolean;
  /** Presencia de la credencial. Nunca se expone su valor. */
  credentialConfigured: boolean;
  /** Qué falta para que los envíos salgan de verdad. */
  problems: string[];
};

/**
 * Estado de la configuración de correo, para mostrarlo en Ajustes.
 * Devuelve solo booleanos sobre las credenciales, nunca su contenido.
 */
export function describeMailConfig(): MailConfig {
  const explicit = (process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  const provider = resolveProvider().name;
  const enabled = process.env.MAIL_ENABLED !== "false";
  const from = process.env.MAIL_FROM?.trim() || null;

  const credentialConfigured = provider === "resend" ? Boolean(process.env.RESEND_API_KEY) : true;

  const problems: string[] = [];

  if (provider === "mock") {
    problems.push(
      "El proveedor simulado no envía nada: los correos se imprimen en la consola del servidor.",
    );
  }

  if (provider === "resend" && !credentialConfigured) {
    problems.push("Falta RESEND_API_KEY en el entorno.");
  }

  if (provider !== "mock" && !from) {
    problems.push("Falta MAIL_FROM; se usará un remitente de ejemplo que Resend rechazará.");
  }

  if (!enabled) {
    problems.push("MAIL_ENABLED=false: los envíos están silenciados.");
  }

  return {
    provider,
    autoDetected: !explicit && provider !== "mock",
    from,
    replyTo: process.env.MAIL_REPLY_TO?.trim() || null,
    enabled,
    credentialConfigured,
    problems,
  };
}

export { mockProvider, resendProvider };
