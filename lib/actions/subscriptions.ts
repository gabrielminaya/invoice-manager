"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  currencyEnum,
  recurrenceIntervalEnum,
  subscriptionItems,
  subscriptions,
  subscriptionStatusEnum,
} from "@/lib/db/schema";
import { getActiveCompany, getCompanyById } from "@/lib/company-context";
import { inferAnchorDay } from "@/lib/recurrence";
import { assertClientBelongsToCompany, ClientCompanyMismatchError } from "@/lib/services/clients";
import { runRecurringBilling } from "@/lib/services/recurring";
import * as f from "@/lib/form";
import { requireUser } from "@/lib/auth/dal";

/** Traduce la regla de dominio a un error que el formulario sabe mostrar. */
async function checkClient(clientId: string, companyId: string) {
  try {
    await assertClientBelongsToCompany(clientId, companyId);
  } catch (error) {
    if (error instanceof ClientCompanyMismatchError) {
      throw new f.ValidationError(error.message);
    }
    throw error;
  }
}

function readSubscriptionFields(formData: FormData) {
  const startDate = f.date(formData, "startDate", "La fecha de inicio");
  const interval = f.enumValue(
    formData,
    "interval",
    "La frecuencia",
    recurrenceIntervalEnum.enumValues,
    "monthly",
  );
  const endDate = f.optionalDate(formData, "endDate", "La fecha de fin");

  if (endDate && endDate < startDate) {
    throw new f.ValidationError("La fecha de fin no puede ser anterior al inicio");
  }

  const intervalCount = f.integer(formData, "intervalCount", "Cada cuántos períodos", 1);
  if (intervalCount < 1 || intervalCount > 60) {
    throw new f.ValidationError("El número de períodos debe estar entre 1 y 60");
  }

  const maxOccurrences = f.optionalNumber(formData, "maxOccurrences", "El número de emisiones");

  return {
    name: f.text(formData, "name", "El nombre del contrato"),
    clientId: f.text(formData, "clientId", "El cliente"),
    currency: f.enumValue(formData, "currency", "La divisa", currencyEnum.enumValues, "DOP"),
    taxRate: f.number(formData, "taxRate", "El ITBIS", 0),
    interval,
    intervalCount,
    startDate,
    endDate,
    anchorDay: inferAnchorDay(startDate, interval),
    maxOccurrences: maxOccurrences != null ? Math.trunc(maxOccurrences) : null,
    autoIssue: f.bool(formData, "autoIssue"),
    paymentMethod: f.optionalText(formData, "paymentMethod"),
    paymentTermsDays: f.optionalNumber(formData, "paymentTermsDays", "Los días de crédito"),
    notes: f.optionalText(formData, "notes"),
  };
}

export async function createSubscription(
  _prev: f.ActionState,
  formData: FormData,
): Promise<f.ActionState> {
  await requireUser();

  let newId = "";

  const state = await f.withValidation(async () => {
    // El formulario envía la compañía emisora; la cookie es solo el respaldo.
    const submitted = f.optionalText(formData, "companyId");
    const company = submitted ? await getCompanyById(submitted) : await getActiveCompany();
    if (!company) {
      throw new f.ValidationError(
        submitted ? "La compañía emisora no existe" : "Crea primero una compañía emisora",
      );
    }

    const values = readSubscriptionFields(formData);
    const items = f.lines(formData, values.taxRate);
    await checkClient(values.clientId, company.id);

    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(subscriptions)
        .values({
          ...values,
          companyId: company.id,
          // El primer ciclo se emite en la fecha de inicio. Si esa fecha ya
          // pasó, el cron la recupera en su próxima corrida.
          nextRunDate: values.startDate,
          status: "active",
        })
        .returning({ id: subscriptions.id });

      newId = created.id;

      await tx.insert(subscriptionItems).values(
        items.map((item, index) => ({ ...item, subscriptionId: created.id, position: index })),
      );
    });
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect(`/subscriptions/${newId}`);
}

export async function updateSubscription(
  _prev: f.ActionState,
  formData: FormData,
): Promise<f.ActionState> {
  await requireUser();

  let id = "";

  const state = await f.withValidation(async () => {
    id = f.text(formData, "id", "La recurrencia");
    const values = readSubscriptionFields(formData);
    const items = f.lines(formData, values.taxRate);
    const nextRunDate = f.date(formData, "nextRunDate", "La próxima emisión");

    // La compañía emisora no se puede cambiar al editar: las facturas ya
    // emitidas cuelgan de su serie de numeración.
    const [existing] = await db
      .select({ companyId: subscriptions.companyId })
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!existing) throw new f.ValidationError("La recurrencia no existe");
    await checkClient(values.clientId, existing.companyId);

    await db.transaction(async (tx) => {
      await tx
        .update(subscriptions)
        .set({ ...values, nextRunDate, updatedAt: raw`now()` })
        .where(eq(subscriptions.id, id));

      // Reemplazar los conceptos es más simple y seguro que reconciliarlos:
      // las facturas ya emitidas guardan su propia copia de las líneas.
      await tx.delete(subscriptionItems).where(eq(subscriptionItems.subscriptionId, id));
      await tx.insert(subscriptionItems).values(
        items.map((item, index) => ({ ...item, subscriptionId: id, position: index })),
      );
    });
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect(`/subscriptions/${id}`);
}

/** Pausa, reactiva o cancela una recurrencia. */
export async function setSubscriptionStatus(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La recurrencia");
  const status = f.enumValue(formData, "status", "El estado", subscriptionStatusEnum.enumValues);

  await db
    .update(subscriptions)
    .set({ status, updatedAt: raw`now()` })
    .where(eq(subscriptions.id, id));

  revalidatePath("/", "layout");
}

/**
 * Emite ya el próximo ciclo pendiente, sin esperar al cronjob.
 *
 * Reutiliza el mismo motor que el cron —con la fecha de corte puesta en la
 * próxima emisión de esta recurrencia— para que las reglas de numeración,
 * período e idempotencia sean idénticas por los dos caminos.
 */
export async function issueSubscriptionNow(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "La recurrencia");

  const [sub] = await db
    .select({ nextRunDate: subscriptions.nextRunDate })
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);

  if (!sub) return;

  await runRecurringBilling({
    subscriptionId: id,
    asOf: sub.nextRunDate,
    limitPerSubscription: 1,
    triggeredBy: "ui:emitir-ahora",
  });

  revalidatePath("/", "layout");
}
