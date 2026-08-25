/**
 * Formas de pago que ofrece la app.
 *
 * Se guardan como texto y no como enumerado de Postgres a propósito: cada
 * negocio puede tener sus propias formas de cobro, y un enumerado obligaría a
 * una migración para añadir una. La lista de abajo es solo la que se ofrece en
 * los desplegables.
 *
 * "Por defecto" es la forma genérica —la que aparece en la factura de
 * referencia— para cuando aún no se ha acordado ninguna en concreto.
 */
export const PAYMENT_METHODS = [
  "Por defecto",
  "Efectivo",
  "Transferencia",
  "Depósito",
  "Cheque",
  "Tarjeta de crédito",
  "Tarjeta de débito",
  "Crédito",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "Por defecto";

/**
 * Opciones para un desplegable, incluyendo el valor ya guardado aunque no esté
 * en la lista.
 *
 * Sin esto, editar un registro con una forma de pago antigua o personalizada la
 * cambiaría en silencio por la primera opción del desplegable.
 */
export function paymentMethodOptions(current?: string | null): string[] {
  const value = current?.trim();
  if (!value || PAYMENT_METHODS.includes(value as PaymentMethod)) {
    return [...PAYMENT_METHODS];
  }
  return [value, ...PAYMENT_METHODS];
}
