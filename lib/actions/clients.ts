"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, currencyEnum } from "@/lib/db/schema";
import { getActiveCompany } from "@/lib/company-context";
import * as f from "@/lib/form";
import { requireUser } from "@/lib/auth/dal";

function readClientFields(formData: FormData) {
  const currency = f.optionalText(formData, "currency");

  return {
    name: f.text(formData, "name", "El nombre"),
    rnc: f.optionalText(formData, "rnc"),
    email: f.optionalText(formData, "email"),
    emailCc: f.optionalEmailList(formData, "emailCc", "El CC"),
    phone: f.optionalText(formData, "phone"),
    addressLine: f.optionalText(formData, "addressLine"),
    city: f.optionalText(formData, "city"),
    country: f.optionalText(formData, "country"),
    // Vacío = hereda de la compañía.
    currency: currency
      ? f.enumValue(formData, "currency", "La divisa", currencyEnum.enumValues)
      : null,
    paymentTermsDays: f.optionalNumber(formData, "paymentTermsDays", "Los días de crédito"),
    taxRate: f.optionalNumber(formData, "taxRate", "El ITBIS"),
    notes: f.optionalText(formData, "notes"),
    active: f.bool(formData, "active"),
  };
}

export async function createClient(_prev: f.ActionState, formData: FormData): Promise<f.ActionState> {
  await requireUser();

  const state = await f.withValidation(async () => {
    const company = await getActiveCompany();
    if (!company) throw new f.ValidationError("Crea primero una compañía emisora");

    await db.insert(clients).values({ ...readClientFields(formData), companyId: company.id });
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect("/clients");
}

export async function updateClient(_prev: f.ActionState, formData: FormData): Promise<f.ActionState> {
  await requireUser();

  let id = "";

  const state = await f.withValidation(async () => {
    id = f.text(formData, "id", "El cliente");
    await db
      .update(clients)
      .set({ ...readClientFields(formData), updatedAt: raw`now()` })
      .where(eq(clients.id, id));
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect(`/clients/${id}`);
}

/** Activa o desactiva un cliente. No se borra para no perder su historial. */
export async function toggleClientActive(formData: FormData) {
  await requireUser();

  const id = f.text(formData, "id", "El cliente");
  await db
    .update(clients)
    .set({ active: raw`not ${clients.active}`, updatedAt: raw`now()` })
    .where(eq(clients.id, id));
  revalidatePath("/", "layout");
}
