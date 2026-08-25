import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, eq, gt, lt, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users, type User } from "@/lib/db/schema";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth/constants";

export { SESSION_COOKIE };

/**
 * El token va en la cookie; en la base se guarda solo su hash.
 *
 * SHA-256 basta porque el token son 32 bytes aleatorios: no hay nada que
 * adivinar por fuerza bruta, a diferencia de una contraseña.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = Pick<User, "id" | "email" | "name">;

/**
 * Abre una sesión y deja la cookie puesta.
 *
 * Solo puede llamarse desde una Server Action o un Route Handler: escribir
 * cookies durante el render de un Server Component no está permitido.
 */
export async function createSession(
  userId: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: context.userAgent?.slice(0, 300) ?? null,
    ipAddress: context.ipAddress ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // En producción la cookie solo viaja por HTTPS; en local hay que permitir HTTP.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  // Aprovecha la escritura para limpiar sesiones caducadas.
  await deleteExpiredSessions();
}

/**
 * Usuario de la sesión actual, o `null`.
 *
 * `cache` memoiza el resultado durante un mismo render, así que aunque lo
 * llamen la página y varias consultas, la base se consulta una sola vez.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        // Una sesión caducada o un usuario desactivado no dan acceso.
        gt(sessions.expiresAt, raw`now()`),
        eq(users.active, true),
      ),
    )
    .limit(1);

  return row ?? null;
});

/** Cierra la sesión actual: borra la fila y la cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }

  store.delete(SESSION_COOKIE);
}

/** Cierra todas las sesiones de un usuario (cambio de contraseña, robo de equipo). */
export async function destroyAllSessions(userId: string): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return deleted.length;
}

export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, raw`now()`))
    .returning({ id: sessions.id });
  return deleted.length;
}
