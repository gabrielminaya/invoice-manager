import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { CRON_SECRET } from "@/lib/env";
import { isISODate } from "@/lib/dates";
import { runRecurringBilling, type RunOptions } from "@/lib/services/recurring";

/** El cron nunca debe servirse desde caché. */
export const dynamic = "force-dynamic";
/** node porque usa el pool de Postgres y node:crypto. */
export const runtime = "nodejs";
/** Recuperar muchos ciclos atrasados puede tardar; damos margen. */
export const maxDuration = 60;

/**
 * Endpoint que dispara la facturación recurrente.
 *
 *   GET  /api/cron/recurring?token=<secreto>
 *   POST /api/cron/recurring        con Authorization: Bearer <secreto>
 *
 * Acepta GET porque muchos programadores de tareas y servicios de monitoreo
 * solo hacen GET, y POST para invocaciones con parámetros:
 *
 *   { "asOf": "2026-09-01", "dryRun": true, "limitPerSubscription": 3 }
 *
 * Parámetros (query string en GET, cuerpo JSON en POST):
 *   asOf                 fecha de corte YYYY-MM-DD (por defecto hoy)
 *   dryRun               "1"/true para simular sin escribir
 *   limitPerSubscription ciclos atrasados máximos por recurrencia (def. 12)
 *   subscriptionId       procesar una sola recurrencia
 *
 * Es idempotente: repetir la llamada el mismo día no duplica facturas.
 */
async function handle(
  request: NextRequest,
  parseOptions: () => Promise<RunOptions> | RunOptions,
) {
  // Autenticar antes de tocar el cuerpo o los parámetros: un llamante sin
  // credenciales no debe poder distinguir un parámetro inválido de un 401.
  const auth = authorize(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let options: RunOptions;
  try {
    options = await parseOptions();
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Parámetros inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await runRecurringBilling({
      ...options,
      triggeredBy: options.triggeredBy ?? describeCaller(request),
    });

    return Response.json(
      { ok: true, ...result },
      {
        status: result.errors > 0 ? 207 : 200,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[cron/recurring] fallo la corrida", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request, () => {
    const params = request.nextUrl.searchParams;
    return {
      asOf: readDate(params.get("asOf")),
      dryRun: readBool(params.get("dryRun")),
      limitPerSubscription: readInt(params.get("limitPerSubscription")),
      subscriptionId: params.get("subscriptionId") ?? undefined,
    };
  });
}

export async function POST(request: NextRequest) {
  return handle(request, async () => {
    let body: Record<string, unknown> = {};
    const text = await request.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error("El cuerpo debe ser JSON válido");
      }
    }

    return {
      asOf: readDate(typeof body.asOf === "string" ? body.asOf : null),
      dryRun: readBool(body.dryRun),
      limitPerSubscription: readInt(body.limitPerSubscription),
      subscriptionId: typeof body.subscriptionId === "string" ? body.subscriptionId : undefined,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Autenticación
 * ------------------------------------------------------------------ */

type AuthResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Compara el secreto recibido con el configurado.
 *
 * Sin CRON_SECRET el endpoint queda cerrado: es preferible fallar a exponer la
 * emisión de facturas. La comparación es de tiempo constante para no filtrar
 * el secreto carácter a carácter.
 */
function authorize(request: NextRequest): AuthResult {
  const expected = CRON_SECRET();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET no está configurado en el servidor",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const provided =
    bearer ||
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("token") ||
    "";

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Credenciales de cron inválidas" };
  }

  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual exige longitudes iguales. La comparación de longitud sale
  // temprano, así que solo revela el tamaño del secreto, no su contenido.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function describeCaller(request: NextRequest): string {
  const ua = request.headers.get("user-agent") ?? "sin user-agent";
  return `${request.method} ${ua}`.slice(0, 200);
}

/* ------------------------------------------------------------------ *
 * Parseo de parámetros
 * ------------------------------------------------------------------ */

function readDate(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!isISODate(value)) throw new Error(`asOf debe tener formato YYYY-MM-DD, recibido: ${value}`);
  return value;
}

function readBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "si", "sí"].includes(String(value).toLowerCase());
}

function readInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), 60);
}
