import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Client, Company, Invoice, InvoiceItem, Payment } from "@/lib/db/schema";
import { formatDateDO } from "@/lib/dates";
import { CURRENCY_LABEL, formatAmount, formatQuantity } from "@/lib/money";
import { withSnapshot } from "@/lib/snapshot";

/**
 * Factura en PDF para adjuntar a los correos.
 *
 * Reproduce la maqueta de `components/invoice-document.tsx` (cabecera, datos,
 * conceptos, totales y recibos) con pdf-lib: JavaScript puro, sin navegador
 * headless ni binarios nativos, así que funciona igual en el servidor de Next,
 * en el contenedor y en el cron por CLI.
 */

export type InvoicePdfData = {
  invoice: Invoice;
  items: InvoiceItem[];
  receipts: Payment[];
  company: Company;
  client: Client;
};

const PAGE = { width: 595.28, height: 841.89 }; // A4 en puntos
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const FAINT = rgb(0.612, 0.639, 0.686);
const LINE = rgb(0.898, 0.906, 0.922);

type Fonts = { regular: PDFFont; bold: PDFFont };

type Column = { header: string; width: number; align: "left" | "right" | "center" };

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const { invoice, items, receipts } = data;
  const company = {
    ...withSnapshot(data.company, invoice.companySnapshot),
    // Igual que en pantalla: el logo sale siempre del registro vivo.
    logoUrl: data.company.logoUrl,
  };
  const client = withSnapshot(data.client, invoice.clientSnapshot);

  const doc = await PDFDocument.create();
  doc.setTitle(`Factura ${invoice.number}`);
  doc.setAuthor(company.name);
  doc.setCreator(company.name);
  doc.setProducer(company.name);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const writer = new PageWriter(doc, fonts);

  /* --- Cabecera: logo a la izquierda, emisor a la derecha --- */
  const headerTop = writer.y;
  const logo = await loadLogo(doc, company.logoUrl);
  if (logo) {
    const scale = Math.min(180 / logo.width, 48 / logo.height);
    writer.page.drawImage(logo, {
      x: MARGIN,
      y: headerTop - logo.height * scale,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  }

  const cityLine = [
    [company.postalCode, company.city].filter(Boolean).join(" "),
    company.region ? `(${company.region})` : null,
    company.country,
  ]
    .filter(Boolean)
    .join(" ");
  const contactLine = [company.phone, company.email].filter(Boolean).join(" · ");

  writer.textRight(company.name, { size: 15, font: "bold" });
  if (company.addressLine) writer.textRight(`- ${company.addressLine}`, { size: 8.5, color: MUTED });
  if (cityLine) writer.textRight(cityLine, { size: 8.5, color: MUTED });
  if (contactLine) {
    writer.y -= 3;
    writer.textRight(contactLine, { size: 8.5, color: MUTED });
  }
  writer.y = Math.min(writer.y, headerTop - 52);

  /* --- Título --- */
  writer.y -= 24;
  const prefix = "Factura: ";
  writer.page.drawText(clean(prefix), { x: MARGIN, y: writer.y - 14, size: 15, font: fonts.regular, color: INK });
  writer.page.drawText(clean(invoice.number), {
    x: MARGIN + fonts.regular.widthOfTextAtSize(prefix, 15),
    y: writer.y - 14,
    size: 15,
    font: fonts.bold,
    color: INK,
  });
  writer.y -= 22;
  writer.hr();
  writer.y -= 8;

  /* --- Cliente y documento --- */
  const clientAddress = [client.addressLine, client.city, client.country].filter(Boolean).join(", ");
  const left: [string, string][] = [["Cliente: ", client.name]];
  if (clientAddress) left.push(["Dirección: ", clientAddress]);
  if (client.rnc) left.push(["RNC: ", client.rnc]);
  const right: [string, string][] = [
    ["Fecha: ", formatDateDO(invoice.issueDate)],
    ["Serie: ", invoice.series],
    ["Número: ", String(invoice.seriesNumber)],
  ];

  const blockTop = writer.y;
  for (const [label, value] of left) writer.labelled(label, value, "left", CONTENT_WIDTH * 0.62);
  const leftBottom = writer.y;
  writer.y = blockTop;
  for (const [label, value] of right) writer.labelled(label, value, "right");
  writer.y = Math.min(writer.y, leftBottom);

  /* --- Conceptos --- */
  writer.y -= 18;
  writer.table(
    [
      { header: "Referencia - Descripción", width: CONTENT_WIDTH - 210, align: "left" },
      { header: "Cantidad", width: 60, align: "right" },
      { header: "Precio", width: 75, align: "right" },
      { header: "Neto", width: 75, align: "right" },
    ],
    items.map((item) => [
      `${item.reference ? `${item.reference} - ` : ""}${item.description}`,
      formatQuantity(item.quantity),
      formatAmount(item.unitPrice),
      formatAmount(item.net),
    ]),
  );

  /* --- Totales --- */
  writer.y -= 22;
  const withTax = invoice.taxTotal > 0;
  writer.table(
    [
      { header: "Divisa", width: CONTENT_WIDTH - (withTax ? 270 : 180), align: "left" },
      { header: "Neto", width: 90, align: "right" },
      ...(withTax ? [{ header: "ITBIS", width: 90, align: "right" } as Column] : []),
      { header: "Total", width: 90, align: "right" },
    ],
    [
      [
        CURRENCY_LABEL[invoice.currency],
        formatAmount(invoice.subtotal),
        ...(withTax ? [formatAmount(invoice.taxTotal)] : []),
        formatAmount(invoice.total),
      ],
    ],
    { boldLastColumn: true },
  );

  /* --- Recibos --- */
  if (receipts.length > 0) {
    writer.y -= 12;
    writer.table(
      [
        { header: "Recibo", width: 70, align: "center" },
        { header: "Forma de pago", width: CONTENT_WIDTH - 260, align: "center" },
        { header: "Importe", width: 90, align: "right" },
        { header: "Vencimiento", width: 100, align: "right" },
      ],
      receipts.map((receipt) => [
        String(receipt.receiptNumber),
        receipt.method,
        formatAmount(receipt.amount),
        // Helvetica estándar no trae "✓": se marca el pagado con texto.
        `${receipt.dueDate ? formatDateDO(receipt.dueDate) : "-"}${receipt.paidDate ? " (pagado)" : ""}`,
      ]),
    );
  }

  /* --- Notas y pie --- */
  if (invoice.notes) {
    writer.y -= 18;
    writer.paragraph(invoice.notes, { size: 8.5, color: MUTED });
  }

  if (company.rnc) {
    writer.y -= 18;
    writer.paragraph(`RNC emisor: ${company.rnc}${company.legalName ? ` · ${company.legalName}` : ""}`, {
      size: 8,
      color: FAINT,
    });
  }

  return doc.save();
}

/** Nombre del archivo adjunto: `Factura-FAC0010A7.pdf`. */
export function invoicePdfFilename(number: string): string {
  return `Factura-${number.replace(/[^\w.-]+/g, "_")}.pdf`;
}

/* ------------------------------------------------------------------ *
 * Escritura secuencial con salto de página
 * ------------------------------------------------------------------ */

class PageWriter {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  /** Abre página nueva si no caben `height` puntos más. */
  ensure(height: number): boolean {
    if (this.y - height >= MARGIN) return false;
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
    return true;
  }

  font(kind: "regular" | "bold" = "regular"): PDFFont {
    return this.fonts[kind];
  }

  textRight(text: string, opts: { size: number; font?: "regular" | "bold"; color?: ReturnType<typeof rgb> }) {
    const font = this.font(opts.font);
    const value = fit(clean(text), font, opts.size, CONTENT_WIDTH * 0.6);
    const lineHeight = opts.size * 1.3;
    this.page.drawText(value, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(value, opts.size),
      y: this.y - opts.size,
      size: opts.size,
      font,
      color: opts.color ?? INK,
    });
    this.y -= lineHeight;
  }

  labelled(label: string, value: string, align: "left" | "right", maxWidth = CONTENT_WIDTH) {
    const size = 9.5;
    const labelWidth = this.fonts.regular.widthOfTextAtSize(label, size);
    // Los valores largos (una dirección) siguen en la línea siguiente, alineados
    // con el inicio del valor; como mucho tres líneas para no empujar la tabla.
    const lines = wrap(clean(value), this.fonts.regular, size, maxWidth - labelWidth).slice(0, 3);
    const first = lines[0] ?? "";
    const total = labelWidth + this.fonts.regular.widthOfTextAtSize(first, size);
    const x = align === "left" ? MARGIN : PAGE.width - MARGIN - total;
    this.page.drawText(clean(label), { x, y: this.y - size, size, font: this.fonts.regular, color: MUTED });
    lines.forEach((line, n) => {
      this.page.drawText(line, {
        x: x + labelWidth,
        y: this.y - size - n * size * 1.3,
        size,
        font: this.fonts.regular,
        color: INK,
      });
    });
    this.y -= size * 1.5 + (lines.length - 1) * size * 1.3;
  }

  hr() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.75,
      color: LINE,
    });
  }

  paragraph(text: string, opts: { size: number; color: ReturnType<typeof rgb> }) {
    const lines = text.split(/\r?\n/).flatMap((line) => wrap(clean(line), this.fonts.regular, opts.size, CONTENT_WIDTH));
    for (const line of lines) {
      this.ensure(opts.size * 1.5);
      this.page.drawText(line, { x: MARGIN, y: this.y - opts.size, size: opts.size, font: this.fonts.regular, color: opts.color });
      this.y -= opts.size * 1.5;
    }
  }

  table(columns: Column[], rows: string[][], opts: { boldLastColumn?: boolean } = {}) {
    const size = 9.5;
    const padX = 6;
    const lineHeight = size * 1.3;
    const padY = 5;

    const drawRow = (cells: string[], header: boolean) => {
      const wrapped = cells.map((cell, i) => {
        const font = !header && opts.boldLastColumn && i === cells.length - 1 ? this.fonts.bold : this.fonts.regular;
        return { font, lines: wrap(clean(cell), font, size, columns[i].width - padX * 2) };
      });
      const height = Math.max(...wrapped.map((c) => c.lines.length)) * lineHeight + padY * 2;

      if (this.ensure(height) && !header) drawRow(columns.map((c) => c.header), true);

      let x = MARGIN;
      wrapped.forEach(({ font, lines }, i) => {
        const column = columns[i];
        this.page.drawRectangle({
          x,
          y: this.y - height,
          width: column.width,
          height,
          borderColor: LINE,
          borderWidth: 0.75,
        });
        lines.forEach((line, n) => {
          const width = font.widthOfTextAtSize(line, size);
          const textX =
            column.align === "left"
              ? x + padX
              : column.align === "right"
                ? x + column.width - padX - width
                : x + (column.width - width) / 2;
          this.page.drawText(line, {
            x: textX,
            y: this.y - padY - size - n * lineHeight + 1.5,
            size,
            font,
            color: header ? MUTED : INK,
          });
        });
        x += column.width;
      });
      this.y -= height;
    };

    drawRow(columns.map((c) => c.header), true);
    for (const row of rows) drawRow(row, false);
  }
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

/**
 * Las fuentes estándar del PDF usan WinAnsi: cubren tildes, ñ, ¿¡ y €, pero no
 * emojis ni otros alfabetos. Se sustituye lo que no se puede codificar para
 * que un carácter raro en una descripción no tumbe el envío del correo.
 */
function clean(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\t/g, " ")
    .replace(/[^\x20-\x7E -ÿ€·•…]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Una palabra más ancha que la columna se corta a la fuerza.
    current = word;
    while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
      let cut = current.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Recorta con "…" lo que no cabe en una sola línea. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

/**
 * Inserta el logo si es PNG o JPEG (data-URI o URL absoluta). Cualquier fallo
 * —formato SVG, red caída, URL relativa— deja la factura sin logo en lugar de
 * impedir el envío.
 */
async function loadLogo(doc: PDFDocument, logoUrl: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;

  try {
    let bytes: Uint8Array;

    const dataUri = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(logoUrl);
    if (dataUri) {
      bytes = dataUri[2]
        ? Uint8Array.from(Buffer.from(dataUri[3], "base64"))
        : new TextEncoder().encode(decodeURIComponent(dataUri[3]));
    } else if (/^https?:\/\//i.test(logoUrl)) {
      bytes = await download(logoUrl);
    } else if (logoUrl.startsWith("/")) {
      // Ruta de `public/` ("/logos/x.png"): se lee del disco, que existe tanto
      // en desarrollo como en el contenedor; si no, se pide a la propia app.
      const path = decodeURIComponent(logoUrl.split(/[?#]/)[0]);
      const file = join(process.cwd(), "public", normalize(path));
      if (file.startsWith(join(process.cwd(), "public"))) {
        try {
          bytes = new Uint8Array(await readFile(file));
        } catch {
          const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/+$/, "");
          if (!base) return null;
          bytes = await download(`${base}${logoUrl}`);
        }
      } else {
        return null;
      }
    } else {
      return null;
    }

    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`logo: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
