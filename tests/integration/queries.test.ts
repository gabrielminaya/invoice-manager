import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";

/**
 * Estas pruebas ejecutan **todas** las consultas de lectura contra Postgres.
 *
 * Su motivo de ser: una consulta con SQL inválido —una subconsulta
 * correlacionada ambigua, una columna mal cualificada— compila sin problemas en
 * TypeScript y solo falla al ejecutarse. Sin esto, el error aparece en pantalla
 * en producción.
 */

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { db } = await import("@/lib/db");
const { sessions, users } = await import("@/lib/db/schema");
const { hashPassword } = await import("@/lib/auth/password");
const { SESSION_COOKIE } = await import("@/lib/auth/constants");
const queries = await import("@/lib/queries");
const { listCompanies, getActiveCompany, getCompanyById } = await import("@/lib/company-context");
const { closeDatabase, databaseAvailable, resetDatabase } = await import("../helpers/database");
const { createScenario } = await import("../helpers/fixtures");
const { insertInvoice } = await import("@/lib/services/invoices");
const { runRecurringBilling } = await import("@/lib/services/recurring");

const hayBase = await databaseAvailable();

describe.skipIf(!hayBase)("consultas de lectura (integración)", () => {
  let companyId = "";
  let clientId = "";
  let subscriptionId = "";
  let invoiceId = "";

  beforeAll(async () => {
    await resetDatabase();

    // Sesión válida: las consultas pasan por requireUser().
    const [user] = await db
      .insert(users)
      .values({
        name: "Consultas",
        email: "consultas@example.com",
        passwordHash: await hashPassword("Facturacion2026"),
      })
      .returning();

    const token = randomBytes(32).toString("base64url");
    await db.insert(sessions).values({
      id: createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    cookieJar.set(SESSION_COOKIE, token);

    // Datos con volumen suficiente para que los agregados no salgan vacíos.
    const escenario = await createScenario({ nextRunDate: "2026-08-23" });
    companyId = escenario.company.id;
    clientId = escenario.client.id;
    subscriptionId = escenario.subscription.id;

    await runRecurringBilling({ asOf: "2026-08-25", triggeredBy: "prueba" });

    const factura = await db.transaction((tx) =>
      insertInvoice(tx, {
        companyId,
        clientId,
        issueDate: "2026-08-25",
        lines: [{ description: "Puntual", quantity: 2, unitPrice: 500, taxRate: 18 }],
        status: "issued",
      }),
    );
    invoiceId = factura.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("listUsers devuelve los usuarios con sus sesiones vigentes", async () => {
    const filas = await queries.listUsers();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ email: "consultas@example.com", active: true });
    // La subconsulta correlacionada de sesiones tiene que contar 1.
    expect(filas[0].activeSessions).toBe(1);
  });

  it("listClients calcula recurrencias activas y saldo por cobrar", async () => {
    const filas = await queries.listClients(companyId);
    expect(filas).toHaveLength(1);
    // Estas dos salen de subconsultas correlacionadas: si la columna externa
    // queda sin cualificar, la comparación es siempre falsa y devuelven 0 sin
    // dar ningún error.
    expect(filas[0].subscriptionCount).toBe(1);
    expect(filas[0].outstanding).toBeGreaterThan(0);
  });

  it("listClients filtra por nombre y por RNC", async () => {
    expect(await queries.listClients(companyId, "Operational")).toHaveLength(1);
    expect(await queries.listClients(companyId, "130-87881")).toHaveLength(1);
    expect(await queries.listClients(companyId, "no-existe")).toHaveLength(0);
  });

  it("listActiveClientsAcrossCompanies incluye la compañía de cada cliente", async () => {
    const filas = await queries.listActiveClientsAcrossCompanies();
    expect(filas[0]).toMatchObject({ companyId });
  });

  it("listSubscriptions calcula el importe del ciclo con su ITBIS", async () => {
    const filas = await queries.listSubscriptions(companyId, "all");
    expect(filas).toHaveLength(1);
    expect(filas[0].cycleTotal).toBe(75);
    expect(filas[0].clientName).toBe("Operational Excellence Solutions");
  });

  it("getSubscriptionDetail trae conceptos y facturas generadas", async () => {
    const detalle = await queries.getSubscriptionDetail(subscriptionId);
    expect(detalle?.items).toHaveLength(1);
    expect(detalle?.generated.length).toBeGreaterThan(0);
  });

  it("listInvoices responde a todos los filtros", async () => {
    for (const filtro of ["all", "unpaid", "overdue", "draft", "paid", "void"] as const) {
      const filas = await queries.listInvoices(companyId, { filter: filtro });
      expect(Array.isArray(filas)).toBe(true);
    }
    expect(await queries.listInvoices(companyId, { search: "FAC" })).not.toHaveLength(0);
  });

  it("getInvoiceDetail trae líneas y recibos", async () => {
    const detalle = await queries.getInvoiceDetail(invoiceId);
    expect(detalle?.items).toHaveLength(1);
    expect(detalle?.receipts).toHaveLength(1);
    expect(detalle?.invoice.total).toBe(1180);
  });

  it("getInvoicesByClient y getClient responden", async () => {
    expect(await queries.getInvoicesByClient(clientId)).not.toHaveLength(0);
    expect((await queries.getClient(clientId))?.name).toBe("Operational Excellence Solutions");
  });

  it("getDashboardSummary agrega sin fallar", async () => {
    const resumen = await queries.getDashboardSummary(companyId, "2026-08-25");
    expect(resumen.invoiceCount).toBeGreaterThan(0);
    expect(resumen.outstanding).toBeGreaterThan(0);
    expect(resumen.activeSubscriptions).toBe(1);
    expect(resumen.clientCount).toBe(1);
    expect(Array.isArray(resumen.dueSoon)).toBe(true);
    expect(resumen.recent.length).toBeGreaterThan(0);
    expect(resumen.lastCronRun).not.toBeNull();
  });

  it("listCronRuns devuelve la bitácora", async () => {
    expect(await queries.listCronRuns(5)).not.toHaveLength(0);
  });

  it("el contexto de compañía responde", async () => {
    expect(await listCompanies()).toHaveLength(1);
    expect((await getActiveCompany())?.id).toBe(companyId);
    expect((await getCompanyById(companyId))?.id).toBe(companyId);
    expect(await getCompanyById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("sin sesión, las consultas no devuelven datos", async () => {
    cookieJar.clear();
    // requireUser() redirige; fuera de Next, `redirect` lanza.
    await expect(queries.listUsers()).rejects.toThrow();
    await expect(queries.listInvoices(companyId)).rejects.toThrow();
  });
});
