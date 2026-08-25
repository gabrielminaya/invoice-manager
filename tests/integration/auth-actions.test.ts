import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const cookieJar = new Map<string, { value: string }>();

const fakeStore = {
  get: (name: string) => {
    const found = cookieJar.get(name);
    return found ? { name, value: found.value } : undefined;
  },
  set: (name: string, value: string) => cookieJar.set(name, { value }),
  delete: (name: string) => cookieJar.delete(name),
};

vi.mock("next/headers", () => ({
  cookies: async () => fakeStore,
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.0.0.1" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));

/** `redirect` corta la ejecución lanzando; se imita para poder leer el destino. */
class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { db } = await import("@/lib/db");
const { sessions, users } = await import("@/lib/db/schema");
const { completeSetup, signIn, signOut } = await import("@/lib/actions/auth");
const { getSessionUser } = await import("@/lib/auth/session");
const { closeDatabase, databaseAvailable, resetDatabase } = await import("../helpers/database");

const hayBase = await databaseAvailable();

function formulario(campos: Record<string, string>): FormData {
  const data = new FormData();
  for (const [clave, valor] of Object.entries(campos)) data.append(clave, valor);
  return data;
}

const SETUP_OK = {
  name: "Gabriel Minaya",
  email: "Admin@Example.com",
  password: "Facturacion2026",
  passwordConfirm: "Facturacion2026",
};

/** Ejecuta una acción que redirige y devuelve el destino. */
async function esperarRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof RedirectError) return error.to;
    throw error;
  }
  throw new Error("se esperaba un redirect y no lo hubo");
}

describe.skipIf(!hayBase)("configuración inicial e inicio de sesión (integración)", () => {
  beforeEach(async () => {
    await resetDatabase();
    cookieJar.clear();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("completeSetup", () => {
    it("crea el primer usuario, abre sesión y entra a la app", async () => {
      const destino = await esperarRedirect(() => completeSetup({}, formulario(SETUP_OK)));
      expect(destino).toBe("/");

      const [user] = await db.select().from(users);
      expect(user.name).toBe("Gabriel Minaya");
      // El correo se normaliza a minúsculas.
      expect(user.email).toBe("admin@example.com");
      expect(user.passwordHash).not.toContain("Facturacion2026");
      expect(user.active).toBe(true);

      expect(await db.select().from(sessions)).toHaveLength(1);
      expect(await getSessionUser()).toMatchObject({ email: "admin@example.com" });
    });

    it("queda cerrada en cuanto existe un usuario", async () => {
      await esperarRedirect(() => completeSetup({}, formulario(SETUP_OK)));
      cookieJar.clear();

      const estado = await completeSetup(
        {},
        formulario({ ...SETUP_OK, email: "otro@example.com" }),
      );

      expect(estado.error).toMatch(/ya tiene usuarios/i);
      expect(await db.select().from(users)).toHaveLength(1);
    });

    it("exige que las contraseñas coincidan", async () => {
      const estado = await completeSetup(
        {},
        formulario({ ...SETUP_OK, passwordConfirm: "Facturacion2027" }),
      );
      expect(estado.error).toMatch(/no coinciden/);
      expect(await db.select().from(users)).toHaveLength(0);
    });

    it("rechaza una contraseña débil", async () => {
      const estado = await completeSetup(
        {},
        formulario({ ...SETUP_OK, password: "corta1", passwordConfirm: "corta1" }),
      );
      expect(estado.error).toMatch(/al menos 10 caracteres/);
    });

    it("rechaza un correo sin arroba", async () => {
      const estado = await completeSetup({}, formulario({ ...SETUP_OK, email: "no-es-correo" }));
      expect(estado.error).toMatch(/correo no es válido/);
    });
  });

  describe("signIn", () => {
    beforeEach(async () => {
      await esperarRedirect(() => completeSetup({}, formulario(SETUP_OK)));
      cookieJar.clear();
    });

    it("acepta las credenciales correctas y guarda el último acceso", async () => {
      const destino = await esperarRedirect(() =>
        signIn({}, formulario({ email: "admin@example.com", password: "Facturacion2026" })),
      );

      expect(destino).toBe("/");
      expect(await getSessionUser()).toMatchObject({ email: "admin@example.com" });

      const [user] = await db.select().from(users);
      expect(user.lastLoginAt).not.toBeNull();
    });

    it("el correo no distingue mayúsculas", async () => {
      await esperarRedirect(() =>
        signIn({}, formulario({ email: "ADMIN@example.com", password: "Facturacion2026" })),
      );
      expect(await getSessionUser()).not.toBeNull();
    });

    it("da el mismo mensaje para contraseña mala y correo inexistente", async () => {
      // No debe poder deducirse qué correos están dados de alta.
      const malaClave = await signIn(
        {},
        formulario({ email: "admin@example.com", password: "EquivocadaXX1" }),
      );
      const noExiste = await signIn(
        {},
        formulario({ email: "nadie@example.com", password: "Facturacion2026" }),
      );

      expect(malaClave.error).toBe("Correo o contraseña incorrectos");
      expect(noExiste.error).toBe(malaClave.error);
      expect(cookieJar.size).toBe(0);
    });

    it("rechaza a un usuario desactivado y no le abre sesión nueva", async () => {
      // La sesión creada durante el alta se descarta para medir solo el efecto
      // de este intento de inicio de sesión.
      await db.delete(sessions);
      await db.update(users).set({ active: false });

      const estado = await signIn(
        {},
        formulario({ email: "admin@example.com", password: "Facturacion2026" }),
      );

      expect(estado.error).toMatch(/desactivada/);
      expect(await db.select().from(sessions)).toHaveLength(0);
      expect(cookieJar.size).toBe(0);
    });

    it("vuelve al destino guardado si es interno", async () => {
      const destino = await esperarRedirect(() =>
        signIn(
          {},
          formulario({
            email: "admin@example.com",
            password: "Facturacion2026",
            redirectTo: "/invoices?filter=overdue",
          }),
        ),
      );
      expect(destino).toBe("/invoices?filter=overdue");
    });

    it("ignora un destino externo, que serviría para phishing", async () => {
      for (const malicioso of ["https://malo.example.com", "//malo.example.com", "javascript:alert(1)"]) {
        cookieJar.clear();
        const destino = await esperarRedirect(() =>
          signIn(
            {},
            formulario({
              email: "admin@example.com",
              password: "Facturacion2026",
              redirectTo: malicioso,
            }),
          ),
        );
        expect(destino).toBe("/");
      }
    });
  });

  describe("signOut", () => {
    it("cierra la sesión y manda al login", async () => {
      await esperarRedirect(() => completeSetup({}, formulario(SETUP_OK)));
      expect(await getSessionUser()).not.toBeNull();

      const destino = await esperarRedirect(() => signOut());

      expect(destino).toBe("/login");
      expect(await getSessionUser()).toBeNull();
      expect(await db.select().from(sessions)).toHaveLength(0);
    });
  });

  describe("aislamiento entre usuarios", () => {
    it("la sesión de uno no sirve para otro", async () => {
      await esperarRedirect(() => completeSetup({}, formulario(SETUP_OK)));
      const tokenAdmin = cookieJar.get("session")!.value;

      const { hashPassword } = await import("@/lib/auth/password");
      const [otro] = await db
        .insert(users)
        .values({
          name: "Otra persona",
          email: "otra@example.com",
          passwordHash: await hashPassword("Facturacion2026"),
        })
        .returning();

      cookieJar.set("session", { value: tokenAdmin });
      const sesion = await getSessionUser();
      expect(sesion?.email).toBe("admin@example.com");
      expect(sesion?.id).not.toBe(otro.id);

      // Borrar al otro usuario no afecta a la sesión existente.
      await db.delete(users).where(eq(users.id, otro.id));
      expect(await getSessionUser()).not.toBeNull();
    });
  });
});
