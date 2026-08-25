import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { GET, POST } from "@/app/api/cron/recurring/route";
import { closeDatabase, databaseAvailable, resetDatabase } from "../helpers/database";
import { createScenario } from "../helpers/fixtures";

const hayBase = await databaseAvailable();
const SECRETO = "secreto-de-pruebas";
const URL_BASE = "https://facturas.example.com/api/cron/recurring";

function peticionGet(query = "", headers: Record<string, string> = {}) {
  return new NextRequest(`${URL_BASE}${query}`, { headers });
}

function peticionPost(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe.skipIf(!hayBase)("endpoint del cronjob (integración)", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = SECRETO;
    process.env.MAIL_ENABLED = "false";
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("autenticación", () => {
    it("rechaza una petición sin credenciales", async () => {
      const respuesta = await GET(peticionGet());

      expect(respuesta.status).toBe(401);
      await expect(respuesta.json()).resolves.toMatchObject({ ok: false });
    });

    it("rechaza un secreto equivocado", async () => {
      const respuesta = await GET(peticionGet("?token=otro-secreto"));
      expect(respuesta.status).toBe(401);
    });

    it("rechaza un secreto con el prefijo correcto pero más largo", async () => {
      // La comparación es de longitud fija: un secreto que empieza igual no pasa.
      const respuesta = await GET(peticionGet(`?token=${SECRETO}-extra`));
      expect(respuesta.status).toBe(401);
    });

    it("acepta el secreto por Authorization: Bearer", async () => {
      const respuesta = await GET(peticionGet("", { authorization: `Bearer ${SECRETO}` }));
      expect(respuesta.status).toBe(200);
    });

    it("acepta el secreto por la cabecera x-cron-secret", async () => {
      const respuesta = await GET(peticionGet("", { "x-cron-secret": SECRETO }));
      expect(respuesta.status).toBe(200);
    });

    it("acepta el secreto por query string", async () => {
      const respuesta = await GET(peticionGet(`?token=${SECRETO}`));
      expect(respuesta.status).toBe(200);
    });

    it("queda cerrado si el servidor no tiene CRON_SECRET", async () => {
      delete process.env.CRON_SECRET;

      const respuesta = await GET(peticionGet(`?token=${SECRETO}`));

      // 503 y no 401: el problema es del servidor, no del llamante.
      expect(respuesta.status).toBe(503);
      await expect(respuesta.json()).resolves.toMatchObject({
        error: expect.stringContaining("CRON_SECRET"),
      });

      process.env.CRON_SECRET = SECRETO;
    });

    it("no revela nada sobre los parámetros a quien no está autenticado", async () => {
      // asOf inválido + sin credenciales: debe responder 401, no 400.
      const respuesta = await GET(peticionGet("?asOf=no-es-fecha"));
      expect(respuesta.status).toBe(401);
    });
  });

  describe("emisión", () => {
    it("emite por GET y devuelve el resumen", async () => {
      await createScenario({ nextRunDate: "2026-08-23" });

      const respuesta = await GET(peticionGet(`?token=${SECRETO}&asOf=2026-08-25`));
      const cuerpo = await respuesta.json();

      expect(respuesta.status).toBe(200);
      expect(cuerpo).toMatchObject({ ok: true, asOf: "2026-08-25", created: 1, errors: 0 });
      expect(respuesta.headers.get("cache-control")).toBe("no-store");
      expect(await db.select().from(invoices)).toHaveLength(1);
    });

    it("emite por POST con parámetros en el cuerpo", async () => {
      await createScenario({ nextRunDate: "2026-08-23" });

      const respuesta = await POST(
        peticionPost({ asOf: "2026-11-30", limitPerSubscription: 2 }, {
          authorization: `Bearer ${SECRETO}`,
        }),
      );
      const cuerpo = await respuesta.json();

      expect(respuesta.status).toBe(200);
      expect(cuerpo.created).toBe(2);
    });

    it("acepta un POST sin cuerpo", async () => {
      const respuesta = await POST(
        new NextRequest(URL_BASE, { method: "POST", headers: { authorization: `Bearer ${SECRETO}` } }),
      );
      expect(respuesta.status).toBe(200);
    });

    it("simula sin escribir con dryRun", async () => {
      await createScenario({ nextRunDate: "2026-08-23" });

      const respuesta = await GET(peticionGet(`?token=${SECRETO}&asOf=2026-08-25&dryRun=1`));
      const cuerpo = await respuesta.json();

      expect(cuerpo).toMatchObject({ dryRun: true, created: 1 });
      expect(await db.select().from(invoices)).toHaveLength(0);
    });

    it("es idempotente al repetir la misma llamada", async () => {
      await createScenario({ nextRunDate: "2026-08-23" });
      const url = `?token=${SECRETO}&asOf=2026-08-25`;

      const primera = await (await GET(peticionGet(url))).json();
      const segunda = await (await GET(peticionGet(url))).json();

      expect(primera.created).toBe(1);
      expect(segunda.created).toBe(0);
      expect(await db.select().from(invoices)).toHaveLength(1);
    });

    it("devuelve 207 cuando una recurrencia falla y otras se emiten", async () => {
      const { company, client } = await createScenario({ nextRunDate: "2026-08-23" });
      const { createSubscription } = await import("../helpers/fixtures");
      await createSubscription(company.id, client.id, {
        nextRunDate: "2026-08-23",
        withoutItems: true,
      });

      const respuesta = await GET(peticionGet(`?token=${SECRETO}&asOf=2026-08-25`));
      const cuerpo = await respuesta.json();

      // 207 Multi-Status: hubo un fallo parcial, no un fallo total.
      expect(respuesta.status).toBe(207);
      expect(cuerpo).toMatchObject({ ok: true, created: 1, errors: 1 });
    });
  });

  describe("parámetros inválidos", () => {
    it("rechaza un asOf mal formado con 400", async () => {
      const respuesta = await GET(peticionGet(`?token=${SECRETO}&asOf=25-08-2026`));

      expect(respuesta.status).toBe(400);
      await expect(respuesta.json()).resolves.toMatchObject({
        error: expect.stringContaining("YYYY-MM-DD"),
      });
    });

    it("rechaza un cuerpo que no es JSON con 400", async () => {
      const respuesta = await POST(
        peticionPost("{esto no es json", { authorization: `Bearer ${SECRETO}` }),
      );

      expect(respuesta.status).toBe(400);
      await expect(respuesta.json()).resolves.toMatchObject({
        error: expect.stringContaining("JSON"),
      });
    });

    it("ignora un limitPerSubscription absurdo en lugar de fallar", async () => {
      await createScenario({ nextRunDate: "2026-01-23" });

      const respuesta = await GET(
        peticionGet(`?token=${SECRETO}&asOf=2026-11-30&limitPerSubscription=0`),
      );

      // 0 no es válido: se usa el valor por defecto (12).
      expect(respuesta.status).toBe(200);
      expect((await respuesta.json()).created).toBe(11);
    });

    it("acepta las variantes de dryRun en español", async () => {
      await createScenario({ nextRunDate: "2026-08-23" });

      const respuesta = await GET(peticionGet(`?token=${SECRETO}&asOf=2026-08-25&dryRun=si`));

      expect((await respuesta.json()).dryRun).toBe(true);
      expect(await db.select().from(invoices)).toHaveLength(0);
    });
  });
});
