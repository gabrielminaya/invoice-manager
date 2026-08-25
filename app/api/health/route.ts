import { sql } from "@/lib/db";

/**
 * Sonda de salud para el orquestador de contenedores.
 *
 * Responde 200 solo si además de estar en pie puede hablar con Postgres: un
 * contenedor que no llega a la base no debería recibir tráfico.
 *
 * No expone nada más que ese estado; queda fuera del proxy de sesión igual que
 * el resto de `/api`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await sql`select 1`;
    return Response.json(
      { ok: true, database: "up" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] la base de datos no responde", error);
    return Response.json(
      { ok: false, database: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
