import { isISODate, type ISODate } from "@/lib/dates";

/** Error de validación de formulario: su mensaje se muestra al usuario. */
export class ValidationError extends Error {}

export type ActionState = { ok?: boolean; error?: string; message?: string };

function raw(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function text(form: FormData, key: string, label: string): string {
  const value = raw(form, key);
  if (!value) throw new ValidationError(`${label} es obligatorio`);
  return value;
}

export function optionalText(form: FormData, key: string): string | null {
  return raw(form, key) || null;
}

/**
 * Forma mínima de una dirección de correo. No pretende validar el RFC: solo
 * descarta lo que seguro no es una dirección, para que un dedo torcido no
 * acabe en un CC que el proveedor rechaza en silencio.
 */
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * Lee una lista de direcciones separadas por comas, punto y coma o saltos de
 * línea, admitiendo la forma `Nombre <correo@dominio>`.
 *
 * Devuelve la lista normalizada y sin repetidos en una sola cadena —el formato
 * en el que se guarda—, o null si está vacía. Un nombre entrecomillado que
 * contenga una coma se partiría en dos: el caso es lo bastante raro como para
 * no complicar el separador.
 */
export function optionalEmailList(form: FormData, key: string, label: string): string | null {
  const value = raw(form, key);
  if (!value) return null;

  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const part of value.split(/[,;\n]+/)) {
    const entry = part.trim();
    if (!entry) continue;

    const match = entry.match(/^(.*?)\s*<\s*([^>]+)\s*>$/);
    const email = (match ? match[2] : entry).trim();
    if (!EMAIL_RE.test(email)) {
      throw new ValidationError(`${label}: "${entry}" no es una dirección de correo válida`);
    }

    // El duplicado se decide por la dirección, no por el nombre que la
    // acompaña: quien escriba el mismo correo dos veces no recibe dos copias.
    const dedupeKey = email.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const name = match?.[1]?.trim();
    addresses.push(name ? `${name} <${email}>` : email);
  }

  return addresses.join(", ") || null;
}

export function number(form: FormData, key: string, label: string, fallback?: number): number {
  const value = raw(form, key);
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`${label} es obligatorio`);
  }
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new ValidationError(`${label} debe ser un número`);
  return parsed;
}

export function optionalNumber(form: FormData, key: string, label: string): number | null {
  const value = raw(form, key);
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new ValidationError(`${label} debe ser un número`);
  return parsed;
}

export function integer(form: FormData, key: string, label: string, fallback?: number): number {
  const parsed = number(form, key, label, fallback);
  return Math.trunc(parsed);
}

export function date(form: FormData, key: string, label: string): ISODate {
  const value = raw(form, key);
  if (!value) throw new ValidationError(`${label} es obligatoria`);
  if (!isISODate(value)) throw new ValidationError(`${label} debe tener formato AAAA-MM-DD`);
  return value;
}

export function optionalDate(form: FormData, key: string, label: string): ISODate | null {
  const value = raw(form, key);
  if (!value) return null;
  if (!isISODate(value)) throw new ValidationError(`${label} debe tener formato AAAA-MM-DD`);
  return value;
}

export function bool(form: FormData, key: string): boolean {
  const value = raw(form, key).toLowerCase();
  return value === "on" || value === "true" || value === "1";
}

export function enumValue<T extends string>(
  form: FormData,
  key: string,
  label: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  const value = raw(form, key) as T;
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`${label} es obligatorio`);
  }
  if (!allowed.includes(value)) throw new ValidationError(`${label} tiene un valor inválido`);
  return value;
}

/**
 * Lee las líneas de un editor de conceptos.
 *
 * El editor envía campos indexados (`lines[0].description`), lo que permite
 * añadir y quitar filas sin JavaScript y que el formulario siga funcionando.
 */
export type ParsedLine = {
  reference: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export function lines(form: FormData, defaultTaxRate = 0): ParsedLine[] {
  const descriptions = form.getAll("lineDescription");
  const references = form.getAll("lineReference");
  const quantities = form.getAll("lineQuantity");
  const prices = form.getAll("lineUnitPrice");
  const taxes = form.getAll("lineTaxRate");

  const parsed: ParsedLine[] = [];

  for (let i = 0; i < descriptions.length; i += 1) {
    const description = String(descriptions[i] ?? "").trim();
    // Las filas vacías se descartan en silencio: el editor siempre deja una
    // fila en blanco al final para facilitar añadir otra.
    if (!description) continue;

    const quantity = Number(String(quantities[i] ?? "1").replace(",", "."));
    const unitPrice = Number(String(prices[i] ?? "0").replace(",", "."));
    const taxRate = Number(String(taxes[i] ?? defaultTaxRate).replace(",", "."));

    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new ValidationError(`La cantidad de "${description}" debe ser mayor que cero`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      throw new ValidationError(`El precio de "${description}" no es válido`);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)
      throw new ValidationError(`El ITBIS de "${description}" debe estar entre 0 y 100`);

    parsed.push({
      reference: String(references[i] ?? "").trim() || null,
      description,
      quantity,
      unitPrice,
      taxRate,
    });
  }

  if (parsed.length === 0) throw new ValidationError("Añade al menos un concepto");
  return parsed;
}

/** Envuelve una acción para convertir los errores de validación en estado del formulario. */
export async function withValidation(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
}
