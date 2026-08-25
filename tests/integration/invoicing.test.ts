import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, invoiceItems, invoices, payments, subscriptions } from "@/lib/db/schema";
import { insertInvoice, issueOccurrence } from "@/lib/services/invoices";
import {
  assertClientBelongsToCompany,
  clientBelongsToCompany,
  ClientCompanyMismatchError,
} from "@/lib/services/clients";
import { reserveInvoiceNumber } from "@/lib/numbering";
import { dueOccurrences } from "@/lib/recurrence";
import { closeDatabase, databaseAvailable, resetDatabase } from "../helpers/database";
import { createClient, createCompany, createScenario } from "../helpers/fixtures";

const hayBase = await databaseAvailable();

describe.skipIf(!hayBase)("emisión de facturas (integración)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("reserveInvoiceNumber", () => {
    it("continúa la serie desde el contador de la compañía", async () => {
      const company = await createCompany();

      const primero = await db.transaction((tx) => reserveInvoiceNumber(tx, company.id));
      expect(primero).toEqual({ number: "FAC0010A8", series: "General", seriesNumber: 8 });

      const segundo = await db.transaction((tx) => reserveInvoiceNumber(tx, company.id));
      expect(segundo.number).toBe("FAC0010A9");
      expect(segundo.seriesNumber).toBe(9);
    });

    it("no reparte el mismo número a dos emisiones simultáneas", async () => {
      // Este es el escenario que protege el SELECT ... FOR UPDATE: el cronjob
      // emitiendo a la vez que un usuario guarda una factura a mano.
      const company = await createCompany();

      const reservas = await Promise.all(
        Array.from({ length: 12 }, () =>
          db.transaction((tx) => reserveInvoiceNumber(tx, company.id)),
        ),
      );

      const numeros = reservas.map((r) => r.number);
      const correlativos = reservas.map((r) => r.seriesNumber).sort((a, b) => a - b);

      expect(new Set(numeros).size).toBe(12);
      expect(correlativos).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

      const [actualizada] = await db
        .select({ docCounter: companies.docCounter, seriesCounter: companies.seriesCounter })
        .from(companies)
        .where(eq(companies.id, company.id));
      expect(actualizada.docCounter).toBe(4275);
      expect(actualizada.seriesCounter).toBe(19);
    });

    it("falla si la compañía no existe", async () => {
      await expect(
        db.transaction((tx) =>
          reserveInvoiceNumber(tx, "00000000-0000-0000-0000-000000000000"),
        ),
      ).rejects.toThrow(/No existe la compañía/);
    });
  });

  describe("insertInvoice", () => {
    it("reproduce la factura de referencia", async () => {
      const company = await createCompany();
      const client = await createClient(company.id);

      const invoice = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: company.id,
          clientId: client.id,
          issueDate: "2026-07-23",
          lines: [{ description: "Mantenimiento Eugenia", quantity: 1, unitPrice: 75, taxRate: 0 }],
          status: "issued",
        }),
      );

      expect(invoice.number).toBe("FAC0010A8");
      expect(invoice.series).toBe("General");
      expect(invoice.seriesNumber).toBe(8);
      expect(invoice.issueDate).toBe("2026-07-23");
      // El cliente tiene 0 días de crédito: vence el mismo día.
      expect(invoice.dueDate).toBe("2026-07-23");
      expect(invoice.currency).toBe("USD");
      expect(invoice.subtotal).toBe(75);
      expect(invoice.taxTotal).toBe(0);
      expect(invoice.total).toBe(75);
      expect(invoice.status).toBe("issued");
      expect(invoice.paymentMethod).toBe("Por defecto");
    });

    it("crea las líneas con su neto e impuesto calculados", async () => {
      const company = await createCompany({ defaultCurrency: "DOP" });
      const client = await createClient(company.id, { currency: "DOP", paymentTermsDays: 30 });

      const invoice = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: company.id,
          clientId: client.id,
          issueDate: "2026-09-01",
          lines: [
            { reference: "SOP-001", description: "Soporte", quantity: 20, unitPrice: 1500, taxRate: 18 },
            { reference: "HOST-01", description: "Hosting", quantity: 1, unitPrice: 4500, taxRate: 18 },
          ],
          status: "issued",
        }),
      );

      expect(invoice.subtotal).toBe(34500);
      expect(invoice.taxTotal).toBe(6210);
      expect(invoice.total).toBe(40710);
      // 30 días de crédito del cliente.
      expect(invoice.dueDate).toBe("2026-10-01");

      const items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoice.id))
        .orderBy(invoiceItems.position);

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ reference: "SOP-001", net: 30000, taxAmount: 5400, position: 0 });
      expect(items[1]).toMatchObject({ reference: "HOST-01", net: 4500, taxAmount: 810, position: 1 });
    });

    it("congela los datos fiscales del emisor y del cliente", async () => {
      const company = await createCompany();
      const client = await createClient(company.id);

      const invoice = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: company.id,
          clientId: client.id,
          issueDate: "2026-07-23",
          lines: [{ description: "Servicio", quantity: 1, unitPrice: 10, taxRate: 0 }],
        }),
      );

      expect(invoice.companySnapshot).toMatchObject({ name: "Neurosoft", rnc: "131-00000-1" });
      expect(invoice.clientSnapshot).toMatchObject({
        name: "Operational Excellence Solutions",
        rnc: "130-87881-1",
      });

      // Cambiar el cliente después no altera la factura ya emitida.
      const { clients } = await import("@/lib/db/schema");
      await db.update(clients).set({ addressLine: "Otra dirección" }).where(eq(clients.id, client.id));

      const [releida] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(releida.clientSnapshot).toMatchObject({
        addressLine: "C/Rafael A. Sanchez 39, Piantini",
      });
    });

    it("no congela el logo: es marca, no dato fiscal", async () => {
      // Congelarlo dejaría sin logo toda factura emitida antes de configurarlo.
      const company = await createCompany({ logoUrl: "/logos/actual.svg" });
      const client = await createClient(company.id);

      const invoice = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: company.id,
          clientId: client.id,
          issueDate: "2026-07-23",
          lines: [{ description: "Servicio", quantity: 1, unitPrice: 10, taxRate: 0 }],
        }),
      );

      expect(invoice.companySnapshot).not.toHaveProperty("logoUrl");
      // Los datos fiscales sí se congelan.
      expect(invoice.companySnapshot).toMatchObject({ rnc: "131-00000-1" });
    });

    it("crea el recibo pendiente con el importe y su vencimiento", async () => {
      const company = await createCompany();
      const client = await createClient(company.id, { paymentTermsDays: 15 });

      const invoice = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: company.id,
          clientId: client.id,
          issueDate: "2026-07-23",
          lines: [{ description: "Servicio", quantity: 1, unitPrice: 75, taxRate: 0 }],
        }),
      );

      const recibos = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id));
      expect(recibos).toHaveLength(1);
      expect(recibos[0]).toMatchObject({
        receiptNumber: 1,
        amount: 75,
        method: "Por defecto",
        dueDate: "2026-08-07",
        paidDate: null,
      });
    });

    it("rechaza una factura sin líneas", async () => {
      const company = await createCompany();
      const client = await createClient(company.id);

      await expect(
        db.transaction((tx) =>
          insertInvoice(tx, {
            companyId: company.id,
            clientId: client.id,
            issueDate: "2026-07-23",
            lines: [],
          }),
        ),
      ).rejects.toThrow(/al menos una línea/);
    });

    it("rechaza un cliente de otra compañía", async () => {
      const propia = await createCompany();
      const ajena = await createCompany({ name: "Otra SRL", isDefault: false });
      const clienteAjeno = await createClient(ajena.id);

      await expect(
        db.transaction((tx) =>
          insertInvoice(tx, {
            companyId: propia.id,
            clientId: clienteAjeno.id,
            issueDate: "2026-07-23",
            lines: [{ description: "Servicio", quantity: 1, unitPrice: 10, taxRate: 0 }],
          }),
        ),
      ).rejects.toThrow(/no pertenece a esta compañía/);
    });

    it("cada compañía lleva su propia serie de numeración", async () => {
      // Es lo que hace útil el selector de compañía emisora: dos emisores no
      // comparten correlativo ni formato.
      const neurosoft = await createCompany();
      const otra = await createCompany({
        name: "Caribe Studio",
        invoicePrefix: "CST",
        invoiceSeries: "A",
        docCounter: 0,
        seriesCounter: 0,
        numberFormat: "decimal",
        isDefault: false,
      });

      const clienteA = await createClient(neurosoft.id);
      const clienteB = await createClient(otra.id, { name: "Hotel Bávaro Beach" });

      const linea = [{ description: "Servicio", quantity: 1, unitPrice: 100, taxRate: 0 }];

      const facturaA = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: neurosoft.id,
          clientId: clienteA.id,
          issueDate: "2026-08-25",
          lines: linea,
        }),
      );
      const facturaB = await db.transaction((tx) =>
        insertInvoice(tx, {
          companyId: otra.id,
          clientId: clienteB.id,
          issueDate: "2026-08-25",
          lines: linea,
        }),
      );

      expect(facturaA.number).toBe("FAC0010A8");
      expect(facturaA.series).toBe("General");
      expect(facturaA.seriesNumber).toBe(8);

      expect(facturaB.number).toBe("CST000001");
      expect(facturaB.series).toBe("A");
      expect(facturaB.seriesNumber).toBe(1);
    });

    it("no consume número si la transacción falla", async () => {
      const company = await createCompany();
      const client = await createClient(company.id);

      await expect(
        db.transaction(async (tx) => {
          await insertInvoice(tx, {
            companyId: company.id,
            clientId: client.id,
            issueDate: "2026-07-23",
            lines: [{ description: "Servicio", quantity: 1, unitPrice: 10, taxRate: 0 }],
          });
          throw new Error("fallo posterior");
        }),
      ).rejects.toThrow(/fallo posterior/);

      const [sinCambios] = await db
        .select({ docCounter: companies.docCounter })
        .from(companies)
        .where(eq(companies.id, company.id));
      expect(sinCambios.docCounter).toBe(4263);
      expect(await db.select().from(invoices)).toHaveLength(0);
    });
  });

  describe("regla cliente-compañía", () => {
    it("acepta un cliente de la misma compañía", async () => {
      const company = await createCompany();
      const client = await createClient(company.id);

      await expect(
        assertClientBelongsToCompany(client.id, company.id),
      ).resolves.toBeUndefined();
      expect(await clientBelongsToCompany(client.id, company.id)).toBe(true);
    });

    it("rechaza un cliente de otra compañía", async () => {
      const propia = await createCompany();
      const ajena = await createCompany({ name: "Otra SRL", isDefault: false });
      const clienteAjeno = await createClient(ajena.id);

      expect(await clientBelongsToCompany(clienteAjeno.id, propia.id)).toBe(false);
      await expect(
        assertClientBelongsToCompany(clienteAjeno.id, propia.id),
      ).rejects.toThrow(ClientCompanyMismatchError);
    });

    it("rechaza un cliente inexistente", async () => {
      const company = await createCompany();
      await expect(
        assertClientBelongsToCompany("00000000-0000-0000-0000-000000000000", company.id),
      ).rejects.toThrow(/no pertenece a esta compañía/);
    });
  });

  describe("issueOccurrence", () => {
    it("emite el ciclo y adelanta el calendario de la recurrencia", async () => {
      const { subscription } = await createScenario();
      const [ciclo] = dueOccurrences(
        { ...subscription, intervalCount: subscription.intervalCount },
        "2026-08-23",
      );

      const generada = await issueOccurrence(subscription.id, ciclo);

      expect(generada).not.toBeNull();
      expect(generada!.invoice.number).toBe("FAC0010A8");
      expect(generada!.invoice.status).toBe("issued");
      expect(generada!.invoice.generatedByCron).toBe(true);
      expect(generada!.invoice.periodKey).toBe("2026-08-23");
      expect(generada!.invoice.periodStart).toBe("2026-08-23");
      expect(generada!.invoice.periodEnd).toBe("2026-09-22");
      expect(generada!.invoice.notes).toContain("agosto 2026");

      const [actualizada] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id));
      expect(actualizada.nextRunDate).toBe("2026-09-23");
      expect(actualizada.lastRunDate).toBe("2026-08-23");
      expect(actualizada.occurrences).toBe(1);
      expect(actualizada.status).toBe("active");
    });

    it("es idempotente: el mismo ciclo no se factura dos veces", async () => {
      const { subscription } = await createScenario();
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      const primera = await issueOccurrence(subscription.id, ciclo);
      const segunda = await issueOccurrence(subscription.id, ciclo);

      expect(primera).not.toBeNull();
      // El índice único (subscription_id, period_key) bloquea el duplicado.
      expect(segunda).toBeNull();
      expect(await db.select().from(invoices)).toHaveLength(1);
    });

    it("resiste dos emisiones simultáneas del mismo ciclo", async () => {
      const { subscription } = await createScenario();
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      const resultados = await Promise.all([
        issueOccurrence(subscription.id, ciclo),
        issueOccurrence(subscription.id, ciclo),
        issueOccurrence(subscription.id, ciclo),
      ]);

      expect(resultados.filter(Boolean)).toHaveLength(1);
      expect(await db.select().from(invoices)).toHaveLength(1);
    });

    it("con autoIssue apagado deja la factura en borrador", async () => {
      const { subscription } = await createScenario({ autoIssue: false });
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      const generada = await issueOccurrence(subscription.id, ciclo);

      expect(generada!.invoice.status).toBe("draft");
      expect(generada!.invoice.issuedAt).toBeNull();
    });

    it("finaliza la recurrencia al alcanzar su fecha de fin", async () => {
      const { subscription } = await createScenario({ endDate: "2026-09-01" });
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      await issueOccurrence(subscription.id, ciclo);

      const [actualizada] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id));
      // El siguiente ciclo (23-09) cae más allá del 01-09.
      expect(actualizada.status).toBe("finished");
    });

    it("finaliza al completar el número máximo de emisiones", async () => {
      const { subscription } = await createScenario({ maxOccurrences: 1 });
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      await issueOccurrence(subscription.id, ciclo);

      const [actualizada] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id));
      expect(actualizada.status).toBe("finished");
      expect(actualizada.occurrences).toBe(1);
    });

    it("no emite una recurrencia pausada", async () => {
      const { subscription } = await createScenario();
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      await db
        .update(subscriptions)
        .set({ status: "paused" })
        .where(eq(subscriptions.id, subscription.id));

      expect(await issueOccurrence(subscription.id, ciclo)).toBeNull();
      expect(await db.select().from(invoices)).toHaveLength(0);
    });

    it("falla, sin dejar rastro, si la recurrencia no tiene conceptos", async () => {
      const { subscription } = await createScenario({ withoutItems: true });
      const [ciclo] = dueOccurrences(subscription, "2026-08-23");

      await expect(issueOccurrence(subscription.id, ciclo)).rejects.toThrow(
        /no tiene conceptos/,
      );
      expect(await db.select().from(invoices)).toHaveLength(0);
    });

    it("permite facturas manuales sin período junto a las recurrentes", async () => {
      // period_key nulo: en Postgres los NULL no colisionan en un índice único,
      // así que dos facturas manuales pueden convivir.
      const { company, client } = await createScenario();

      for (const fecha of ["2026-07-01", "2026-07-02"]) {
        await db.transaction((tx) =>
          insertInvoice(tx, {
            companyId: company.id,
            clientId: client.id,
            issueDate: fecha,
            lines: [{ description: "Servicio puntual", quantity: 1, unitPrice: 10, taxRate: 0 }],
          }),
        );
      }

      expect(await db.select().from(invoices)).toHaveLength(2);
    });
  });
});
