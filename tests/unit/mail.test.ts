import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { dedupeAddresses, parseAddress, parseAddressList, sendMail, toRecipients } from "@/lib/mail";
import { clearOutbox, readOutbox } from "@/lib/mail";
import { invoiceIssued, invoiceOverdue, paymentReceipt } from "@/lib/mail/templates";
import type { InvoiceMailData } from "@/lib/mail/templates";

const factura: InvoiceMailData = {
  number: "FAC0010A8",
  clientName: "Operational Excellence Solutions",
  companyName: "Neurosoft",
  issueDate: "2026-08-23",
  dueDate: "2026-09-22",
  total: 75,
  currency: "USD",
  status: "issued",
  url: "https://facturas.example.com/invoices/abc",
  periodLabel: "agosto 2026",
};

describe("parseAddress", () => {
  it("separa nombre y correo", () => {
    expect(parseAddress("Neurosoft <facturacion@neurosoft.dev>")).toEqual({
      name: "Neurosoft",
      email: "facturacion@neurosoft.dev",
    });
  });

  it("acepta un correo suelto", () => {
    expect(parseAddress("  pagos@example.com ")).toEqual({ email: "pagos@example.com" });
  });

  it("convierte a lista de destinatarios", () => {
    expect(toRecipients("a@example.com")).toHaveLength(1);
    expect(toRecipients(["a@example.com", "B <b@example.com>"])).toEqual([
      { email: "a@example.com" },
      { name: "B", email: "b@example.com" },
    ]);
  });
});

describe("listas de direcciones", () => {
  it("separa por comas, punto y coma y saltos de línea", () => {
    expect(parseAddressList("a@x.do; Ana <ana@x.do>\nb@x.do")).toEqual([
      { email: "a@x.do" },
      { name: "Ana", email: "ana@x.do" },
      { email: "b@x.do" },
    ]);
  });

  it("una lista vacía o ausente no produce direcciones", () => {
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList("  ,  ")).toEqual([]);
  });

  it("quita repetidos y lo que ya está en la lista excluida", () => {
    const cc = dedupeAddresses(
      [{ email: "Copia@x.do" }, { email: "copia@x.do" }, { email: "jefe@x.do" }],
      [{ email: "COPIA@x.do" }],
    );
    expect(cc).toEqual([{ email: "jefe@x.do" }]);
  });
});

describe("plantilla de factura emitida", () => {
  const cuerpo = invoiceIssued(factura);

  it("resume la factura en el asunto", () => {
    expect(cuerpo.subject).toBe("Factura FAC0010A8 · US$ 75.00");
  });

  it("incluye importe, fechas y período en el texto plano", () => {
    expect(cuerpo.text).toContain("US$ 75.00");
    expect(cuerpo.text).toContain("23-08-2026");
    expect(cuerpo.text).toContain("22-09-2026");
    expect(cuerpo.text).toContain("agosto 2026");
    expect(cuerpo.text).toContain(factura.url!);
  });

  it("genera también versión HTML", () => {
    expect(cuerpo.html).toContain("<!doctype html>");
    expect(cuerpo.html).toContain("FAC0010A8");
  });

  it("lleva clave de idempotencia atada a la factura", () => {
    expect(cuerpo.idempotencyKey).toBe("invoice-issued-FAC0010A8");
  });

  it("omite el botón cuando no hay URL pública", () => {
    const sinUrl = invoiceIssued({ ...factura, url: undefined });
    expect(sinUrl.html).not.toContain("Ver la factura");
    expect(sinUrl.text).not.toContain("Puedes consultarla");
  });

  it("escapa el HTML de los datos del cliente", () => {
    // Un nombre con < > no debe poder inyectar etiquetas en el correo.
    const cuerpoRaro = invoiceIssued({ ...factura, clientName: '<script>alert(1)</script>' });
    expect(cuerpoRaro.html).not.toContain("<script>");
    expect(cuerpoRaro.html).toContain("&lt;script&gt;");
  });
});

describe("plantilla de recordatorio", () => {
  const cuerpo = invoiceOverdue({ ...factura, daysLate: 12 });

  it("indica los días de atraso", () => {
    expect(cuerpo.subject).toContain("vencida");
    expect(cuerpo.text).toContain("12 día(s) de atraso");
  });

  it("varía la clave por día, para permitir un recordatorio por jornada", () => {
    expect(cuerpo.idempotencyKey).toBe("invoice-overdue-FAC0010A8-12");
    expect(invoiceOverdue({ ...factura, daysLate: 13 }).idempotencyKey).toBe(
      "invoice-overdue-FAC0010A8-13",
    );
  });
});

describe("plantilla de recibo", () => {
  it("confirma el pago con su número de recibo", () => {
    const cuerpo = paymentReceipt({ ...factura, paidDate: "2026-09-20", receiptNumber: 1 });
    expect(cuerpo.subject).toContain("Pago recibido");
    expect(cuerpo.text).toContain("20-09-2026");
    expect(cuerpo.idempotencyKey).toBe("payment-receipt-FAC0010A8-1");
  });
});

describe("sendMail", () => {
  beforeEach(() => {
    clearOutbox();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MAIL_ENABLED;
    process.env.MAIL_ENABLED = "false";
  });

  it("omite el envío sin destinatarios", async () => {
    const resultado = await sendMail({ to: [], subject: "x", text: "x" });
    expect(resultado).toMatchObject({ ok: true, skipped: true });
  });

  it("respeta MAIL_ENABLED=false", async () => {
    process.env.MAIL_ENABLED = "false";
    const resultado = await sendMail({
      to: toRecipients("cliente@example.com"),
      subject: "x",
      text: "x",
    });
    expect(resultado).toMatchObject({ ok: true, skipped: true });
    expect(readOutbox()).toHaveLength(0);
  });

  it("con el proveedor simulado deja el correo en la bandeja", async () => {
    process.env.MAIL_ENABLED = "true";
    const resultado = await sendMail({
      to: toRecipients("cliente@example.com"),
      ...invoiceIssued(factura),
    });

    expect(resultado.ok).toBe(true);
    const bandeja = readOutbox();
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0].subject).toContain("FAC0010A8");
    // El remitente lo pone sendMail a partir de MAIL_FROM.
    expect(bandeja[0].from?.email).toBe("pruebas@example.com");
  });

  it("nunca lanza: un proveedor que falla devuelve el error en el resultado", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "";

    const resultado = await sendMail({
      to: toRecipients("cliente@example.com"),
      subject: "x",
      text: "x",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/RESEND_API_KEY/);

    process.env.MAIL_PROVIDER = "mock";
    delete process.env.RESEND_API_KEY;
  });
});
