import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * Capa de acceso a datos autenticada.
 *
 * `proxy.ts` hace una comprobación optimista —mira si existe la cookie— para
 * evitar renderizar páginas protegidas, pero la verificación de verdad vive
 * aquí, lo más cerca posible de los datos: las consultas de `lib/queries.ts` y
 * las server actions pasan por `requireUser()`, así que ninguna ruta puede
 * devolver datos sin sesión válida aunque olvide comprobarlo.
 */

/** ¿Hay algún usuario dado de alta? Determina si la app está sin configurar. */
export const hasAnyUser = cache(async (): Promise<boolean> => {
  const [row] = await db.select({ total: count() }).from(users);
  return (row?.total ?? 0) > 0;
});

/** Usuario de la sesión, o `null`. No redirige: para pintar cabeceras. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * Exige una sesión válida y devuelve el usuario.
 *
 * Sin sesión redirige a `/setup` si la app todavía no tiene usuarios, y a
 * `/login` en cualquier otro caso: en el primer arranque no tiene sentido pedir
 * unas credenciales que nadie ha creado.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;

  redirect((await hasAnyUser()) ? "/login" : "/setup");
}

/** Para las pantallas públicas: si ya hay sesión, no tiene sentido mostrarlas. */
export async function redirectIfAuthenticated(to = "/"): Promise<void> {
  if (await getSessionUser()) redirect(to);
}
