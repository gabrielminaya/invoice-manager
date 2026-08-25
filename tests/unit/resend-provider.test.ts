import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resendProvider } from "@/lib/mail/providers/resend";
import type { MailMessage } from "@/lib/mail/types";

const mensaje: Required<Pick<MailMessage, "from">> & MailMessage = {
  from: { name: "Neurosoft", email: "facturacion@neurosoft.dev" },
  to: [{ name: "Cliente", email: "cliente@example.com" }],
  subject: "Factura FAC0010A8",
  text: "Importe: US$ 75.00",
  html: "<p>Importe: US$ 75.00</p>",
  idempotencyKey: "invoice-issued-FAC0010A8",
  tags: { type: "invoice_issued", invoice: "FAC0010A8" },
};

/** Respuesta JSON mínima, como la que devuelve la API de Resend. */
function respuesta(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_clave_de_pruebas";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
});

describe("envío correcto", () => {
  it("devuelve el id que asigna Resend", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: "abc-123" }));

    const resultado = await resendProvider.send(mensaje);

    expect(resultado).toEqual({ ok: true, id: "abc-123", provider: "resend" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("construye el cuerpo con los nombres de campo de la API", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: "abc" }));

    await resendProvider.send({
      ...mensaje,
      replyTo: { email: "responder@neurosoft.dev" },
      cc: [{ email: "copia@example.com" }],
      attachments: [{ filename: "factura.pdf", content: "YmFzZTY0", contentType: "application/pdf" }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");

    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.from).toBe("Neurosoft <facturacion@neurosoft.dev>");
    expect(cuerpo.to).toEqual(["Cliente <cliente@example.com>"]);
    expect(cuerpo.cc).toEqual(["copia@example.com"]);
    // Resend espera snake_case en estos dos campos.
    expect(cuerpo.reply_to).toBe("responder@neurosoft.dev");
    expect(cuerpo.attachments[0].content_type).toBe("application/pdf");
    expect(cuerpo.subject).toBe("Factura FAC0010A8");
    expect(cuerpo.text).toContain("75.00");
    expect(cuerpo.html).toContain("<p>");
  });

  it("manda la clave de idempotencia como cabecera", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: "abc" }));
    await resendProvider.send(mensaje);

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["idempotency-key"]).toBe("invoice-issued-FAC0010A8");
    expect(headers.authorization).toBe("Bearer re_clave_de_pruebas");
  });

  it("recorta una clave de idempotencia demasiado larga", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: "abc" }));
    await resendProvider.send({ ...mensaje, idempotencyKey: "x".repeat(400) });

    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toHaveLength(256);
  });

  it("sanea las etiquetas al juego de caracteres que acepta Resend", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: "abc" }));
    await resendProvider.send({
      ...mensaje,
      tags: { "tipo de correo": "factura emitida · agosto" },
    });

    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpo.tags).toEqual([{ name: "tipo_de_correo", value: "factura_emitida___agosto" }]);
  });

  it("omite los campos opcionales que no se usan", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: "abc" }));
    await resendProvider.send({ from: mensaje.from, to: mensaje.to, subject: "x", text: "y" });

    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpo).not.toHaveProperty("html");
    expect(cuerpo).not.toHaveProperty("cc");
    expect(cuerpo).not.toHaveProperty("reply_to");
    expect(cuerpo).not.toHaveProperty("tags");
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("idempotency-key");
  });
});

describe("configuración incompleta", () => {
  it("avisa de que falta la clave sin llamar a la API", async () => {
    delete process.env.RESEND_API_KEY;

    const resultado = await resendProvider.send(mensaje);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("errores de la API", () => {
  it("no reintenta un 401: es configuración, no un fallo temporal", async () => {
    fetchMock.mockResolvedValue(
      respuesta(401, { statusCode: 401, name: "restricted_api_key", message: "clave restringida" }),
    );

    const resultado = await resendProvider.send(mensaje);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toContain("401");
      expect(resultado.error).toContain("restricted_api_key");
      expect(resultado.error).toContain("clave restringida");
    }
  });

  it("tampoco reintenta un 403 de dominio sin verificar", async () => {
    fetchMock.mockResolvedValue(
      respuesta(403, { name: "validation_error", message: "domain is not verified" }),
    );

    const resultado = await resendProvider.send(mensaje);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!resultado.ok) expect(resultado.error).toMatch(/not verified/);
  });

  it("reintenta un 429 y respeta retry-after", async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuesta(429, { name: "rate_limit_exceeded", message: "demasiadas peticiones" }, {
          "retry-after": "0",
        }),
      )
      .mockResolvedValueOnce(respuesta(200, { id: "tras-reintento" }));

    const resultado = await resendProvider.send(mensaje);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado).toMatchObject({ ok: true, id: "tras-reintento" });
  });

  it("agota los tres intentos con errores de servidor", async () => {
    fetchMock.mockResolvedValue(
      respuesta(500, { name: "internal_error", message: "algo se rompió" }, { "retry-after": "0" }),
    );

    const resultado = await resendProvider.send(mensaje);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("500");
  });

  it("reintenta cuando la red falla y acaba devolviendo el error", async () => {
    fetchMock.mockRejectedValue(new Error("conexión rechazada"));

    // Sin respuesta HTTP no hay retry-after, así que aplica el backoff
    // exponencial. Se simula el tiempo para no esperarlo de verdad.
    vi.useFakeTimers();
    const pendiente = resendProvider.send(mensaje);
    await vi.advanceTimersByTimeAsync(5_000);
    const resultado = await pendiente;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    if (!resultado.ok) expect(resultado.error).toMatch(/conexión rechazada/);
  });

  it("sobrevive a una respuesta que no es JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" }),
    );

    const resultado = await resendProvider.send(mensaje);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("502");
  });

  it("tolera un 200 sin id en el cuerpo", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    const resultado = await resendProvider.send(mensaje);

    expect(resultado).toMatchObject({ ok: true, provider: "resend" });
  });
});
