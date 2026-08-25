"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { currencyEnum, invoices, payments } from "@/lib/db/schema";
import { getActiveCompany, getCompanyById } from "@/lib/company-context";
import { todayInTimeZone } from "@/lib/dates";
import { insertInvoice } from "@/lib/services/invoices";
import { notifyPaymentReceipt } from "@/lib/services/notifications";
import * as f from "@/lib/form";
import { requireUser } from "@/lib/auth/dal";

/**
 * Compañía emisora de la factura.
 *
 * El formulario la envía explícitamente —hay selector cuando hay más de una— y
 * solo se recurre a la cookie de compañía activa si no viene en el formulario.
 * `insertInvoice` comprueba después que el cliente pertenezca a esta compañía.
 */
async function resolveCompany(formData: FormData) {
  const submitted = f.optionalText(formData, "companyId");

  const company = submitted ? await getCompanyById(submitted) : await getActiveCompany();
  if (!company) {
    throw new f.ValidationError(
      submitted ? "La compañía emisora no existe" : "Crea primero una compañía emisora",
    );
  }
  return company;
}

/** Crea una factura puntual, fuera de toda recurrencia. */
export async function createInvoice(
  _prev: f.ActionState,
  formData: FormData,
): Promise<f.ActionState> {
  await requireUser();

  let newId = "";

  const state = await f.withValidation(async () => {
    const company = await resolveCompany(formData);
    const issueDate = f.date(formData, "issueDate", "La fecha de emisión");
    const dueDate = f.optionalDate(formData, "dueDate", "El vencimiento");
    if (dueDate && dueDate < issueDate) {
      throw new f.ValidationError("El vencimiento no puede ser anterior a la emisión");
    }

    const lines = f.lines(formData, company.defaultTaxRate);
    const issueNow = f.bool(formData, "issueNow");

    await db.transaction(async (tx) => {
      const invoice = await insertInvoice(tx, {
        companyId: company.id,
        clientId: f.text(formData, "clientId", "El cliente"),
        issueDate,
        dueDate,
        currency: f.enumValue(
          formData,
          "currency",
          "La divisa",
          currencyEnum.enumValues,
          company.defaultCurrency,
        ),
        paymentMethod: f.optionalText(formData, "paymentMethod"),
        notes: f.optionalText(formData, "notes"),
        status: issueNow ? "issued" : "draft",
        lines,
      });
      newId = invoice.id;
    });
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect(`/invoices/${newId}`);
}

/** Pasa un borrador a emitida. Desde aquí ya cuenta fiscalmente. */
export async function issueInvoice(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La factura");

  await db
    .update(invoices)
    .set({ status: "issued", issuedAt: raw`now()` })
    .where(and(eq(invoices.id, id), eq(invoices.status, "draft")));

  revalidatePath("/", "layout");
}

/** Registra el cobro completo de la factura y sella su recibo. */
export async function markInvoicePaid(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La factura");
  const today = todayInTimeZone(process.env.CRON_TIMEZONE ?? "America/Santo_Domingo");
  let cobrada = false;

  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ total: invoices.total, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);

    if (!invoice || invoice.status === "void" || invoice.status === "paid") return;

    await tx
      .update(invoices)
      .set({
        status: "paid",
        amountPaid: invoice.total,
        paidAt: raw`now()`,
        // Cobrar un borrador lo emite implícitamente.
        issuedAt: raw`coalesce(${invoices.issuedAt}, now())`,
      })
      .where(eq(invoices.id, id));

    await tx
      .update(payments)
      .set({ paidDate: today })
      .where(and(eq(payments.invoiceId, id), eq(payments.receiptNumber, 1)));

    cobrada = true;
  });

  // Fuera de la transacción: el correo no debe alargar el bloqueo de la fila ni
  // poder revertir el cobro si el proveedor falla.
  if (cobrada) await notifyPaymentReceipt(id);

  revalidatePath("/", "layout");
}

/** Reabre una factura cobrada por error. */
export async function reopenInvoice(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La factura");

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({ status: "issued", amountPaid: 0, paidAt: null })
      .where(and(eq(invoices.id, id), eq(invoices.status, "paid")));

    await tx.update(payments).set({ paidDate: null }).where(eq(payments.invoiceId, id));
  });

  revalidatePath("/", "layout");
}

/**
 * Anula una factura. No se borra: el número emitido debe seguir existiendo
 * para que la serie no tenga huecos.
 */
export async function voidInvoice(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La factura");

  await db
    .update(invoices)
    .set({ status: "void", amountPaid: 0, paidAt: null })
    .where(eq(invoices.id, id));

  revalidatePath("/", "layout");
}

/** Borra un borrador. Solo borradores: lo emitido nunca desaparece. */
export async function deleteDraftInvoice(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La factura");

  const deleted = await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.status, "draft")))
    .returning({ id: invoices.id });

  revalidatePath("/", "layout");
  if (deleted.length > 0) redirect("/invoices");
}
