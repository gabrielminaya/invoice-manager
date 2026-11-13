import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { Client, Company, Invoice, InvoiceItem, Payment } from "@/lib/db/schema";
import { invoicePdfFilename, renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

const company = {
  id: "c1",
  name: "Neurosoft",
  legalName: "Neurosoft SRL",
  rnc: "131-00000-1",
  addressLine: "CALLE PALMA LINDA NUM. W4",
  city: "Santiago",
  postalCode: null,
  region: null,
  country: "República Dominicana",
  phone: null,
  email: "support@neurosoft.dev",
  logoUrl: "/logos/neurosoft_logo.png",
} as unknown as Company;

const client = {
  id: "cl1",
  name: "Operational Excellence Solutions",
  rnc: "130-87881-1",
  addressLine: "C/Rafael A. Sánchez 39, Piantini",
  city: "Santo Domingo",
  country: null,
} as unknown as Client;

const invoice = {
  id: "i1",
  number: "FAC0010A8",
  series: "General",
  seriesNumber: 8,
  issueDate: "2026-08-23",
  dueDate: "2026-09-22",
  currency: "USD",
  subtotal: 75,
  taxTotal: 13.5,
  total: 88.5,
  notes: "Gracias por su pago.\nCuenta: 123 — Banco Popular 🚀",
  companySnapshot: null,
  clientSnapshot: null,
} as unknown as Invoice;

const item = (n: number) =>
  ({
    id: `it${n}`,
    reference: n === 0 ? "MNT" : null,
    description: `Mantenimiento mensual del sitio web, línea ${n} con una descripción bastante larga para obligar a partirla`,
    quantity: 1,
    unitPrice: 75,
    net: 75,
  }) as unknown as InvoiceItem;

const receipt = {
  id: "p1",
  receiptNumber: 1,
  method: "Transferencia",
  amount: 88.5,
  dueDate: "2026-09-22",
  paidDate: "2026-09-01",
} as unknown as Payment;

describe("renderInvoicePdf", () => {
  it("genera un PDF válido con tildes, logo relativo y caracteres no soportados", async () => {
    const bytes = await renderInvoicePdf({ invoice, company, client, items: [item(0)], receipts: [receipt] });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Factura FAC0010A8");
  });

  it("pasa a otra página cuando hay muchos conceptos", async () => {
    const items = Array.from({ length: 60 }, (_, n) => item(n));
    const bytes = await renderInvoicePdf({ invoice, company, client, items, receipts: [] });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("no falla con un logo inservible", async () => {
    const bytes = await renderInvoicePdf({
      invoice,
      company: { ...company, logoUrl: "data:image/svg+xml,<svg/>" },
      client,
      items: [item(0)],
      receipts: [],
    });
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe("invoicePdfFilename", () => {
  it("usa el número de la factura", () => {
    expect(invoicePdfFilename("FAC0010A8")).toBe("Factura-FAC0010A8.pdf");
    expect(invoicePdfFilename("A/B 1")).toBe("Factura-A_B_1.pdf");
  });
});
