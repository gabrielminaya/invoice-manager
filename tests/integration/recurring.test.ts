import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, invoices, subscriptions } from "@/lib/db/schema";
import { insertInvoice } from "@/lib/services/invoices";
import { markOverdueInvoices, runRecurringBilling } from "@/lib/services/recurring";
import { clearOutbox, readOutbox } from "@/lib/mail";
import { closeDatabase, databaseAvailable, resetDatabase } from "../helpers/database";
import { createClient, createScenario, createSubscription } from "../helpers/fixtures";

const hayBase = await databaseAvailable();

describe.skipIf(!hayBase)("motor de facturación recurrente (integración)", () => {
  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
    process.env.MAIL_ENABLED = "false";
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("no emite nada si el próximo ciclo aún no vence", async () => {
    await createScenario({ nextRunDate: "2026-09-23" });

    const resultado = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(resultado.scanned).toBe(0);
    expect(resultado.created).toBe(0);
    expect(await db.select().from(invoices)).toHaveLength(0);
  });

  it("emite el ciclo vencido y deja constancia en la bitácora", async () => {
    await createScenario({ nextRunDate: "2026-08-23" });

    const resultado = await runRecurringBilling({ asOf: "2026-08-25", triggeredBy: "prueba" });

    expect(resultado.scanned).toBe(1);
    expect(resultado.created).toBe(1);
    expect(resultado.errors).toBe(0);
    expect(resultado.results[0].status).toBe("created");
    expect(resultado.results[0].invoices[0].number).toBe("FAC0010A8");

    const [corrida] = await db.select().from(cronRuns);
    expect(corrida).toMatchObject({
      asOfDate: "2026-08-25",
      dryRun: false,
      createdCount: 1,
      errorCount: 0,
      triggeredBy: "prueba",
    });
    expect(corrida.finishedAt).not.toBeNull();
  });

  it("repetir la corrida el mismo día no duplica facturas", async () => {
    await createScenario({ nextRunDate: "2026-08-23" });

    const primera = await runRecurringBilling({ asOf: "2026-08-25" });
    const segunda = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(primera.created).toBe(1);
    expect(segunda.created).toBe(0);
    expect(await db.select().from(invoices)).toHaveLength(1);
  });

  it("dos corridas simultáneas no se pisan", async () => {
    // Es lo que ocurre si el cron se solapa con un reintento o con el botón
    // "Ejecutar" de la interfaz.
    await createScenario({ nextRunDate: "2026-08-23" });

    const [a, b] = await Promise.all([
      runRecurringBilling({ asOf: "2026-08-25" }),
      runRecurringBilling({ asOf: "2026-08-25" }),
    ]);

    expect(a.created + b.created).toBe(1);
    expect(a.errors + b.errors).toBe(0);
    expect(await db.select().from(invoices)).toHaveLength(1);
  });

  it("recupera los ciclos atrasados en orden y avanza el calendario", async () => {
    const { subscription } = await createScenario({ nextRunDate: "2026-08-23" });

    const resultado = await runRecurringBilling({ asOf: "2026-11-30" });

    expect(resultado.created).toBe(4);
    expect(resultado.results[0].invoices.map((i) => i.issueDate)).toEqual([
      "2026-08-23",
      "2026-09-23",
      "2026-10-23",
      "2026-11-23",
    ]);

    const [actualizada] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    expect(actualizada.nextRunDate).toBe("2026-12-23");
    expect(actualizada.occurrences).toBe(4);

    // Los números siguen la serie sin huecos.
    const emitidas = await db.select().from(invoices).orderBy(invoices.seriesNumber);
    expect(emitidas.map((i) => i.number)).toEqual([
      "FAC0010A8",
      "FAC0010A9",
      "FAC0010AA",
      "FAC0010AB",
    ]);
  });

  it("limita cuántos atrasos recupera por corrida", async () => {
    await createScenario({ nextRunDate: "2026-01-23" });

    const primera = await runRecurringBilling({ asOf: "2026-11-30", limitPerSubscription: 3 });
    expect(primera.created).toBe(3);

    // La corrida siguiente continúa donde quedó.
    const segunda = await runRecurringBilling({ asOf: "2026-11-30", limitPerSubscription: 3 });
    expect(segunda.created).toBe(3);
    expect(await db.select().from(invoices)).toHaveLength(6);
  });

  it("en simulación calcula pero no escribe", async () => {
    await createScenario({ nextRunDate: "2026-08-23" });

    const resultado = await runRecurringBilling({ asOf: "2026-11-30", dryRun: true });

    expect(resultado.dryRun).toBe(true);
    expect(resultado.created).toBe(4);
    expect(await db.select().from(invoices)).toHaveLength(0);

    // La recurrencia no se movió.
    const [sinCambios] = await db.select().from(subscriptions);
    expect(sinCambios.nextRunDate).toBe("2026-08-23");
    expect(sinCambios.occurrences).toBe(0);

    // La simulación sí queda registrada, marcada como tal.
    const [corrida] = await db.select().from(cronRuns);
    expect(corrida.dryRun).toBe(true);
  });

  it("ignora las recurrencias pausadas y canceladas", async () => {
    const { subscription } = await createScenario({ nextRunDate: "2026-08-23" });
    await db
      .update(subscriptions)
      .set({ status: "paused" })
      .where(eq(subscriptions.id, subscription.id));

    const resultado = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(resultado.scanned).toBe(0);
    expect(await db.select().from(invoices)).toHaveLength(0);
  });

  it("aísla el fallo de una recurrencia sin detener las demás", async () => {
    const { company, client } = await createScenario({ nextRunDate: "2026-08-23" });
    // Segunda recurrencia mal configurada: sin conceptos que facturar.
    await createSubscription(company.id, client.id, {
      nextRunDate: "2026-08-23",
      withoutItems: true,
    });

    const resultado = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(resultado.scanned).toBe(2);
    expect(resultado.created).toBe(1);
    expect(resultado.errors).toBe(1);

    const fallida = resultado.results.find((r) => r.status === "error");
    expect(fallida?.message).toMatch(/no tiene conceptos/);

    // La sana sí se emitió.
    expect(await db.select().from(invoices)).toHaveLength(1);

    const [corrida] = await db.select().from(cronRuns);
    expect(corrida.errorCount).toBe(1);
  });

  it("puede procesar una sola recurrencia", async () => {
    const { company, client, subscription } = await createScenario({ nextRunDate: "2026-08-23" });
    await createSubscription(company.id, client.id, { nextRunDate: "2026-08-23" });

    const resultado = await runRecurringBilling({
      asOf: "2026-08-25",
      subscriptionId: subscription.id,
    });

    expect(resultado.scanned).toBe(1);
    expect(resultado.created).toBe(1);
    expect(await db.select().from(invoices)).toHaveLength(1);
  });

  it("marca en mora lo vencido y no toca lo demás", async () => {
    const { company, client } = await createScenario({ nextRunDate: "2027-01-01" });

    // Emitida y ya vencida.
    const vencida = await db.transaction((tx) =>
      insertInvoice(tx, {
        companyId: company.id,
        clientId: client.id,
        issueDate: "2026-07-01",
        dueDate: "2026-07-31",
        lines: [{ description: "Servicio", quantity: 1, unitPrice: 100, taxRate: 0 }],
        status: "issued",
      }),
    );

    // Emitida pero aún en plazo.
    const enPlazo = await db.transaction((tx) =>
      insertInvoice(tx, {
        companyId: company.id,
        clientId: client.id,
        issueDate: "2026-08-01",
        dueDate: "2026-09-30",
        lines: [{ description: "Servicio", quantity: 1, unitPrice: 100, taxRate: 0 }],
        status: "issued",
      }),
    );

    // Borrador vencido: no se toca, todavía no es un documento emitido.
    const borrador = await db.transaction((tx) =>
      insertInvoice(tx, {
        companyId: company.id,
        clientId: client.id,
        issueDate: "2026-07-01",
        dueDate: "2026-07-31",
        lines: [{ description: "Servicio", quantity: 1, unitPrice: 100, taxRate: 0 }],
        status: "draft",
      }),
    );

    const marcadas = await markOverdueInvoices("2026-08-25");
    expect(marcadas).toBe(1);

    const estado = async (id: string) =>
      (await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, id)))[0]
        .status;

    expect(await estado(vencida.id)).toBe("overdue");
    expect(await estado(enPlazo.id)).toBe("issued");
    expect(await estado(borrador.id)).toBe("draft");
  });

  it("no pone en mora una factura ya cobrada", async () => {
    const { company, client } = await createScenario({ nextRunDate: "2027-01-01" });

    const pagada = await db.transaction((tx) =>
      insertInvoice(tx, {
        companyId: company.id,
        clientId: client.id,
        issueDate: "2026-07-01",
        dueDate: "2026-07-31",
        lines: [{ description: "Servicio", quantity: 1, unitPrice: 100, taxRate: 0 }],
        status: "issued",
      }),
    );
    await db.update(invoices).set({ amountPaid: 100 }).where(eq(invoices.id, pagada.id));

    expect(await markOverdueInvoices("2026-08-25")).toBe(0);
  });

  it("avisa al cliente por correo de cada factura emitida", async () => {
    process.env.MAIL_ENABLED = "true";
    await createScenario({ nextRunDate: "2026-08-23" });

    const resultado = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(resultado.emailsSent).toBe(1);
    expect(resultado.emailsFailed).toBe(0);

    const bandeja = readOutbox();
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0].to[0].email).toBe("cuentas@example.com");
    expect(bandeja[0].subject).toContain("FAC0010A8");
  });

  it("no intenta avisar a un cliente sin correo", async () => {
    process.env.MAIL_ENABLED = "true";
    const { company } = await createScenario({ nextRunDate: "2027-01-01" });
    const sinCorreo = await createClient(company.id, { name: "Sin correo", email: null });
    await createSubscription(company.id, sinCorreo.id, { nextRunDate: "2026-08-23" });

    const resultado = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(resultado.created).toBe(1);
    expect(resultado.emailsSent).toBe(0);
    expect(resultado.emailsFailed).toBe(0);
    expect(readOutbox()).toHaveLength(0);
  });

  it("con autoIssue apagado genera borradores y no avisa", async () => {
    process.env.MAIL_ENABLED = "true";
    await createScenario({ nextRunDate: "2026-08-23", autoIssue: false });

    const resultado = await runRecurringBilling({ asOf: "2026-08-25" });

    expect(resultado.created).toBe(1);
    // Un borrador todavía no es un documento que enviar al cliente.
    expect(resultado.emailsSent).toBe(0);

    const [factura] = await db.select().from(invoices);
    expect(factura.status).toBe("draft");
  });

  it("factura varias recurrencias con divisas e ITBIS distintos", async () => {
    const { company, client } = await createScenario({ nextRunDate: "2026-09-01" });
    const otro = await createClient(company.id, {
      name: "Caribe Logistics SRL",
      currency: "DOP",
      paymentTermsDays: 30,
    });
    await createSubscription(company.id, otro.id, {
      nextRunDate: "2026-09-01",
      currency: "DOP",
      taxRate: 18,
      paymentTermsDays: 30,
      items: [
        { description: "Soporte", quantity: 20, unitPrice: 1500, taxRate: 18 },
        { description: "Hosting", quantity: 1, unitPrice: 4500, taxRate: 18 },
      ],
    });

    const resultado = await runRecurringBilling({ asOf: "2026-09-01" });
    expect(resultado.created).toBe(2);

    const usd = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.clientId, client.id), eq(invoices.currency, "USD")));
    expect(usd[0]).toMatchObject({ total: 75, taxTotal: 0, dueDate: "2026-09-01" });

    const dop = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.clientId, otro.id), eq(invoices.currency, "DOP")));
    expect(dop[0]).toMatchObject({
      subtotal: 34500,
      taxTotal: 6210,
      total: 40710,
      dueDate: "2026-10-01",
    });
  });
});
