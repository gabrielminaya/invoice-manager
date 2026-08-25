/**
 * Contrato de envío de correo, independiente del proveedor.
 *
 * Todo el resto de la app habla solo con estos tipos, así que cambiar de
 * proveedor (Resend, SES, SendGrid, SMTP…) se reduce a añadir un archivo en
 * `providers/` y cambiar la variable MAIL_PROVIDER.
 */

export type MailAddress = {
  email: string;
  name?: string;
};

export type MailAttachment = {
  filename: string;
  /** Contenido ya codificado en base64. */
  content: string;
  contentType?: string;
};

export type MailMessage = {
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  from?: MailAddress;
  replyTo?: MailAddress;
  subject: string;
  /** Versión de texto plano. Obligatoria: mejora la entregabilidad. */
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  /**
   * Clave de idempotencia. Los proveedores que la soportan descartan un envío
   * repetido con la misma clave; el mock la registra para poder depurar.
   */
  idempotencyKey?: string;
  /** Etiquetas para métricas del proveedor. */
  tags?: Record<string, string>;
};

export type MailResult =
  | { ok: true; id: string; provider: string; skipped?: false }
  /** El envío no se intentó: sin destinatario, o el proveedor está deshabilitado. */
  | { ok: true; id: null; provider: string; skipped: true; reason: string }
  | { ok: false; provider: string; error: string };

export type MailProvider = {
  /** Nombre corto, aparece en los logs y en el resultado. */
  readonly name: string;
  send(message: Required<Pick<MailMessage, "from">> & MailMessage): Promise<MailResult>;
};
