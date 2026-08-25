import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * Almacén de cookies simulado.
 *
 * `createSession` y `getSessionUser` usan `cookies()` de next/headers, que solo
 * existe dentro de una petición. Se sustituye por este almacén para poder
 * probar el ciclo completo de sesión contra la base de datos real.
 */
const cookieJar = new Map<string, { value: string; options?: unknown }>();

const fakeStore = {
  get: (name: string) => {
    const found = cookieJar.get(name);
    return found ? { name, value: found.value } : undefined;
  },
  set: (name: string, value: string, options?: unknown) => {
    cookieJar.set(name, { value, options });
  },
  delete: (name: string) => {
    cookieJar.delete(name);
  },
};

vi.mock("next/headers", () => ({
  cookies: async () => fakeStore,
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

// react `cache` memoiza por render; fuera de React hay que desactivarlo o
// getSessionUser devolvería siempre el primer resultado.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { db } = await import("@/lib/db");
const { sessions, users } = await import("@/lib/db/schema");
const {
  createSession,
  destroyAllSessions,
  destroySession,
  deleteExpiredSessions,
  getSessionUser,
  SESSION_COOKIE,
} = await import("@/lib/auth/session");
const { hashPassword } = await import("@/lib/auth/password");
const { closeDatabase, databaseAvailable, resetDatabase } = await import("../helpers/database");

const hayBase = await databaseAvailable();

async function crearUsuario(overrides: Partial<{ email: string; active: boolean }> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      name: "Gabriel Minaya",
      email: overrides.email ?? "admin@example.com",
      passwordHash: await hashPassword("Facturacion2026"),
      active: overrides.active ?? true,
    })
    .returning();
  return user;
}

describe.skipIf(!hayBase)("sesiones (integración)", () => {
  beforeEach(async () => {
    await resetDatabase();
    cookieJar.clear();
  });

  afterEach(() => {
    cookieJar.clear();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("abre sesión y la resuelve desde la cookie", async () => {
    const user = await crearUsuario();

    await createSession(user.id, { userAgent: "vitest", ipAddress: "127.0.0.1" });

    const sesion = await getSessionUser();
    expect(sesion).toMatchObject({ id: user.id, email: "admin@example.com", name: "Gabriel Minaya" });
  });

  it("guarda en la base el hash del token, nunca el token", async () => {
    // Así una copia de la base no permite suplantar sesiones.
    const user = await crearUsuario();
    await createSession(user.id);

    const token = cookieJar.get(SESSION_COOKIE)!.value;
    const [fila] = await db.select().from(sessions);

    expect(fila.id).not.toBe(token);
    expect(fila.id).toBe(createHash("sha256").update(token).digest("hex"));
    expect(token.length).toBeGreaterThan(30);
  });

  it("marca la cookie como httpOnly y con caducidad", async () => {
    const user = await crearUsuario();
    await createSession(user.id);

    const opciones = cookieJar.get(SESSION_COOKIE)!.options as {
      httpOnly: boolean;
      sameSite: string;
      path: string;
      expires: Date;
    };

    expect(opciones.httpOnly).toBe(true);
    expect(opciones.sameSite).toBe("lax");
    expect(opciones.path).toBe("/");
    expect(opciones.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("sin cookie no hay sesión", async () => {
    await crearUsuario();
    expect(await getSessionUser()).toBeNull();
  });

  it("un token inventado no abre sesión", async () => {
    await crearUsuario();
    cookieJar.set(SESSION_COOKIE, { value: "token-falsificado" });
    expect(await getSessionUser()).toBeNull();
  });

  it("una sesión caducada no vale", async () => {
    const user = await crearUsuario();
    await createSession(user.id);

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));

    expect(await getSessionUser()).toBeNull();
  });

  it("desactivar un usuario invalida sus sesiones al instante", async () => {
    const user = await crearUsuario();
    await createSession(user.id);
    expect(await getSessionUser()).not.toBeNull();

    await db.update(users).set({ active: false }).where(eq(users.id, user.id));

    expect(await getSessionUser()).toBeNull();
  });

  it("cerrar sesión borra la fila y la cookie", async () => {
    const user = await crearUsuario();
    await createSession(user.id);

    await destroySession();

    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await getSessionUser()).toBeNull();
  });

  it("cerrar todas las sesiones deja fuera todos los dispositivos", async () => {
    const user = await crearUsuario();
    await createSession(user.id);
    const primera = cookieJar.get(SESSION_COOKIE)!.value;
    await createSession(user.id);
    expect(await db.select().from(sessions)).toHaveLength(2);

    const cerradas = await destroyAllSessions(user.id);
    expect(cerradas).toBe(2);

    cookieJar.set(SESSION_COOKIE, { value: primera });
    expect(await getSessionUser()).toBeNull();
  });

  it("borrar sesiones caducadas no toca las vigentes", async () => {
    const user = await crearUsuario();
    await createSession(user.id);
    await db.insert(sessions).values({
      id: "caducada",
      userId: user.id,
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect(await deleteExpiredSessions()).toBe(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await getSessionUser()).not.toBeNull();
  });

  it("borrar el usuario arrastra sus sesiones", async () => {
    const user = await crearUsuario();
    await createSession(user.id);

    await db.delete(users).where(eq(users.id, user.id));

    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("cada sesión recibe un token distinto", async () => {
    const user = await crearUsuario();
    const tokens = new Set<string>();

    for (let i = 0; i < 5; i += 1) {
      await createSession(user.id);
      tokens.add(cookieJar.get(SESSION_COOKIE)!.value);
    }

    expect(tokens.size).toBe(5);
  });
});
