"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  hashPassword,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/auth/dal";
import * as f from "@/lib/form";

/** Los correos se normalizan a minúsculas: el índice único es sensible a mayúsculas. */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function requestContext() {
  const headerList = await headers();
  return {
    userAgent: headerList.get("user-agent"),
    ipAddress:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null,
  };
}

/**
 * Alta del primer usuario.
 *
 * Solo funciona mientras no exista ninguno: es el arranque de la instalación,
 * no un registro abierto. La comprobación se hace con la tabla bloqueada para
 * que dos peticiones simultáneas no puedan crear dos "primeros" usuarios.
 */
export async function completeSetup(
  _prev: f.ActionState,
  formData: FormData,
): Promise<f.ActionState> {
  const state = await f.withValidation(async () => {
    const name = f.text(formData, "name", "El nombre");
    const email = normalizeEmail(f.text(formData, "email", "El correo"));
    const password = f.text(formData, "password", "La contraseña");
    const confirm = f.text(formData, "passwordConfirm", "La confirmación");

    if (!email.includes("@")) throw new f.ValidationError("El correo no es válido");
    if (password !== confirm) throw new f.ValidationError("Las contraseñas no coinciden");

    const weak = validatePasswordStrength(password);
    if (weak) throw new f.ValidationError(weak);

    const passwordHash = await hashPassword(password);

    const userId = await db.transaction(async (tx) => {
      // El bloqueo cierra la ventana entre "no hay usuarios" y el insert.
      await tx.execute(raw`lock table ${users} in exclusive mode`);

      const existing = await tx.select({ id: users.id }).from(users).limit(1);
      if (existing.length > 0) {
        throw new f.ValidationError(
          "La instalación ya tiene usuarios. Inicia sesión en su lugar.",
        );
      }

      const [created] = await tx
        .insert(users)
        .values({ name, email, passwordHash })
        .returning({ id: users.id });

      return created.id;
    });

    await createSession(userId, await requestContext());
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Inicio de sesión.
 *
 * El mensaje de error es el mismo para correo inexistente y contraseña
 * incorrecta, para no revelar qué correos están dados de alta.
 */
export async function signIn(_prev: f.ActionState, formData: FormData): Promise<f.ActionState> {
  let destination = "/";

  const state = await f.withValidation(async () => {
    const email = normalizeEmail(f.text(formData, "email", "El correo"));
    const password = f.text(formData, "password", "La contraseña");

    const redirectTo = f.optionalText(formData, "redirectTo");
    // Solo rutas internas: un `redirectTo` externo permitiría phishing.
    if (redirectTo?.startsWith("/") && !redirectTo.startsWith("//")) {
      destination = redirectTo;
    }

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        active: users.active,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const credencialesInvalidas = new f.ValidationError("Correo o contraseña incorrectos");

    if (!user) {
      // Se gasta el mismo tiempo que con un usuario real para no filtrar por
      // temporización qué correos existen.
      await verifyPassword(password, "scrypt$16384$8$1$AAAA$AAAA");
      throw credencialesInvalidas;
    }

    if (!(await verifyPassword(password, user.passwordHash))) throw credencialesInvalidas;
    if (!user.active) throw new f.ValidationError("Esta cuenta está desactivada");

    // Si el hash quedó con parámetros antiguos, se actualiza aprovechando que
    // aquí tenemos la contraseña en claro.
    if (needsRehash(user.passwordHash)) {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, user.id));
    }

    await db
      .update(users)
      .set({ lastLoginAt: raw`now()` })
      .where(eq(users.id, user.id));

    await createSession(user.id, await requestContext());
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOut() {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/login");
}

/** Cambio de contraseña del usuario en sesión. */
export async function changePassword(
  _prev: f.ActionState,
  formData: FormData,
): Promise<f.ActionState> {
  return f.withValidation(async () => {
    const session = await getSessionUser();
    if (!session) throw new f.ValidationError("Tu sesión expiró. Vuelve a iniciar sesión.");

    const current = f.text(formData, "currentPassword", "La contraseña actual");
    const next = f.text(formData, "newPassword", "La contraseña nueva");
    const confirm = f.text(formData, "newPasswordConfirm", "La confirmación");

    if (next !== confirm) throw new f.ValidationError("Las contraseñas nuevas no coinciden");

    const weak = validatePasswordStrength(next);
    if (weak) throw new f.ValidationError(weak);

    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    if (!user || !(await verifyPassword(current, user.passwordHash))) {
      throw new f.ValidationError("La contraseña actual no es correcta");
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), updatedAt: raw`now()` })
      .where(eq(users.id, session.id));
  });
}

/** Alta de un usuario adicional, hecha por alguien que ya tiene sesión. */
export async function createUser(
  _prev: f.ActionState,
  formData: FormData,
): Promise<f.ActionState> {
  const state = await f.withValidation(async () => {
    const session = await getSessionUser();
    if (!session) throw new f.ValidationError("Necesitas una sesión activa");
    if (!(await hasAnyUser())) throw new f.ValidationError("La instalación aún no está configurada");

    const name = f.text(formData, "name", "El nombre");
    const email = normalizeEmail(f.text(formData, "email", "El correo"));
    const password = f.text(formData, "password", "La contraseña");

    if (!email.includes("@")) throw new f.ValidationError("El correo no es válido");

    const weak = validatePasswordStrength(password);
    if (weak) throw new f.ValidationError(weak);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new f.ValidationError("Ya existe un usuario con ese correo");

    await db.insert(users).values({ name, email, passwordHash: await hashPassword(password) });
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect("/settings");
}

/** Activa o desactiva un usuario. Nadie puede desactivarse a sí mismo. */
export async function toggleUserActive(formData: FormData) {
  const session = await getSessionUser();
  if (!session) return;

  const id = f.text(formData, "id", "El usuario");
  if (id === session.id) return;

  await db
    .update(users)
    .set({ active: raw`not ${users.active}`, updatedAt: raw`now()` })
    .where(eq(users.id, id));

  revalidatePath("/", "layout");
}
