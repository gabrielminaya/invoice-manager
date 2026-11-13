/**
 * Superpone la copia congelada sobre el registro vivo, ignorando sus campos
 * nulos.
 *
 * Sin ese filtro, un campo que no existía cuando se emitió la factura llega
 * como `null` y borra el valor actual, dejando el dato en blanco en lugar de
 * caer al del registro vivo.
 */
export function withSnapshot<T extends object>(live: T, snapshot: unknown): T {
  if (!snapshot || typeof snapshot !== "object") return live;

  const merged = { ...live };
  for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
    if (value !== null && value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
