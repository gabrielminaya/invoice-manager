/**
 * Constantes de sesión sin dependencias.
 *
 * Vive aparte de `session.ts` a propósito: `proxy.ts` solo necesita el nombre de
 * la cookie, y si lo importara de `session.ts` arrastraría el cliente de
 * Postgres al proxy, que se ejecuta en cada petición.
 */
export const SESSION_COOKIE = "session";

/** Duración de la sesión. Se renueva al iniciar sesión, no en cada visita. */
export const SESSION_DAYS = 30;
