import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

/**
 * Hasheo de contraseñas con scrypt, que viene en Node y no necesita
 * dependencias nativas como bcrypt o argon2.
 *
 * El formato guardado incluye los parámetros de coste:
 *
 *   scrypt$<N>$<r>$<p>$<sal en base64>$<hash en base64>
 *
 * Guardarlos permite endurecer el coste en el futuro sin invalidar las
 * contraseñas existentes: al validar se usan los parámetros del propio hash.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Coste actual. scrypt con N=16384 tarda ~100 ms, suficiente contra fuerza bruta. */
const CURRENT = { N: 16_384, r: 8, p: 1 };

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptWithParams(password, salt, CURRENT);

  return [
    "scrypt",
    CURRENT.N,
    CURRENT.r,
    CURRENT.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Compara una contraseña con su hash.
 *
 * Devuelve `false` ante un hash corrupto en lugar de lanzar: un registro
 * dañado debe impedir el acceso, no tumbar la pantalla de login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = await scryptWithParams(password, salt, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** true si el hash usa parámetros más débiles que los actuales. */
export function needsRehash(stored: string): boolean {
  const [scheme, n, r, p] = stored.split("$");
  if (scheme !== "scrypt") return true;
  return Number(n) < CURRENT.N || Number(r) < CURRENT.r || Number(p) < CURRENT.p;
}

function scryptWithParams(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    throw new Error("Parámetros de scrypt inválidos");
  }

  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      // maxmem por defecto no alcanza para N grandes; se calcula holgado.
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

/** Valida una contraseña nueva y devuelve el motivo del rechazo, si lo hay. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "La contraseña debe combinar letras y números";
  }
  return null;
}
