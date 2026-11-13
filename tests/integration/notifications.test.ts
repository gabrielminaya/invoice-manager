import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { clearOutbox, readOutbox } from "@/lib/mail";
import { insertInvoice } from "@/lib/services/invoices";
import { notifyInvoiceIssued } from "@/lib/services/notifications";
import { closeDatabase, databaseAvailable, resetDatabase } from "../helpers/database";
import { createClient, createCompany } from "../helpers/fixtures";

const hayBase = await databaseAvailable();

/**
 * El CC de los avisos: el del cliente más el buzón de la compañía emisora.
 *
 * El envío se hace con el proveedor simulado —`tests/setup.ts` fija
 * MAIL_PROVIDER=mock— habilitándolo solo dentro de estas pruebas, así que nada
 * sale de la máquina y la bandeja en memoria hace de aserción.
 */
describe.skipIf(!hayBase)("copias de los avisos por correo (integración)", () => {
  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
    process.env.MAIL_ENABLED = "true";
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.MAIL_ENABLED = "false";
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function facturaDe(clientOverrides: Parameters<typeof createClient>[1] = {}, companyEmail: string | null = "support@neurosoft.dev") {
    const company = await createCompany({ email: companyEmail });
    const client = await createClient(company.id, clientOverrides);

    const invoice = await db.transaction((tx) =>
      insertInvoice(tx, {
        companyId: company.id,
        clientId: client.id,
        issueDate: "2026-08-23",
        status: "issued",
        lines: [{ description: "Mantenimiento", quantity: 1, unitPrice: 75, taxRate: 0 }],
      }),
    );

    return invoice;
  }

  it("copia al CC del cliente y a la compañía emisora", async () => {
    const invoice = await facturaDe({ emailCc: "contabilidad@cliente.do, Ana <ana@cliente.do>" });

    const resultado = await notifyInvoiceIssued(invoice.id);
    expect(resultado.ok).toBe(true);

    const [enviado] = readOutbox();
    expect(enviado.to).toEqual([{ email: "cuentas@example.com" }]);
    expect(enviado.cc).toEqual([
      { email: "contabilidad@cliente.do" },
      { name: "Ana", email: "ana@cliente.do" },
      { email: "support@neurosoft.dev" },
    ]);
  });

  it("copia a la compañía aunque el cliente no tenga CC", async () => {
    const invoice = await facturaDe({ emailCc: null });

    await notifyInvoiceIssued(invoice.id);

    expect(readOutbox()[0].cc).toEqual([{ email: "support@neurosoft.dev" }]);
  });

  it("no copia a quien ya es el destinatario", async () => {
    // El correo del cliente repetido en su propio CC no debe duplicar el envío.
    const invoice = await facturaDe({ emailCc: "CUENTAS@example.com, jefe@cliente.do" });

    await notifyInvoiceIssued(invoice.id);

    expect(readOutbox()[0].cc).toEqual([
      { email: "jefe@cliente.do" },
      { email: "support@neurosoft.dev" },
    ]);
  });

  it("se queda sin copias cuando no hay CC ni correo de compañía", async () => {
    const invoice = await facturaDe({ emailCc: null }, null);

    await notifyInvoiceIssued(invoice.id);

    expect(readOutbox()[0].cc).toEqual([]);
  });

  it("adjunta la factura en PDF y no enlaza a la página privada", async () => {
    const invoice = await facturaDe();

    await notifyInvoiceIssued(invoice.id);

    const [enviado] = readOutbox();
    expect(enviado.attachments).toHaveLength(1);
    const [pdf] = enviado.attachments!;
    expect(pdf.filename).toBe(`Factura-${invoice.number}.pdf`);
    expect(pdf.contentType).toBe("application/pdf");
    expect(Buffer.from(pdf.content, "base64").subarray(0, 5).toString()).toBe("%PDF-");

    expect(enviado.html).not.toContain("/invoices/");
    expect(enviado.text).not.toContain("/invoices/");
    expect(enviado.text).toContain("adjunta en PDF");
  });
});
