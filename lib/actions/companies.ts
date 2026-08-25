"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, currencyEnum } from "@/lib/db/schema";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/company-context";
import * as f from "@/lib/form";
import { requireUser } from "@/lib/auth/dal";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Cambia la compañía emisora activa. */
export async function switchCompany(formData: FormData) {
  await requireUser();

  const companyId = f.text(formData, "companyId", "Compañía");
  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, companyId, {
    maxAge: ONE_YEAR,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

function readCompanyFields(formData: FormData) {
  return {
    name: f.text(formData, "name", "El nombre comercial"),
    legalName: f.optionalText(formData, "legalName"),
    rnc: f.optionalText(formData, "rnc"),
    addressLine: f.optionalText(formData, "addressLine"),
    city: f.optionalText(formData, "city"),
    postalCode: f.optionalText(formData, "postalCode"),
    region: f.optionalText(formData, "region"),
    country: f.text(formData, "country", "El país"),
    phone: f.optionalText(formData, "phone"),
    email: f.optionalText(formData, "email"),
    website: f.optionalText(formData, "website"),
    logoUrl: f.optionalText(formData, "logoUrl"),
    defaultCurrency: f.enumValue(formData, "defaultCurrency", "La divisa", currencyEnum.enumValues, "DOP"),
    defaultTaxRate: f.number(formData, "defaultTaxRate", "El ITBIS", 0),
    defaultPaymentTermsDays: f.integer(formData, "defaultPaymentTermsDays", "Los días de crédito", 0),
    defaultPaymentMethod: f.text(formData, "defaultPaymentMethod", "La forma de pago"),
    invoicePrefix: f.text(formData, "invoicePrefix", "El prefijo"),
    invoiceSeries: f.text(formData, "invoiceSeries", "La serie"),
    // El formato y los correlativos no se exponen en el formulario: los lleva
    // el sistema. Al no incluirlos aquí, una edición no puede descuadrarlos.
  };
}

export async function createCompany(_prev: f.ActionState, formData: FormData): Promise<f.ActionState> {
  await requireUser();

  let newId: string | null = null;

  const state = await f.withValidation(async () => {
    const values = readCompanyFields(formData);
    const existing = await db.select({ id: companies.id }).from(companies).limit(1);

    const [created] = await db
      .insert(companies)
      .values({ ...values, isDefault: existing.length === 0 })
      .returning({ id: companies.id });

    newId = created.id;
  });

  if (state.error || !newId) return state;

  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, newId, { maxAge: ONE_YEAR, path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function updateCompany(_prev: f.ActionState, formData: FormData): Promise<f.ActionState> {
  await requireUser();

  const state = await f.withValidation(async () => {
    const id = f.text(formData, "id", "La compañía");

    await db
      .update(companies)
      .set({ ...readCompanyFields(formData), updatedAt: raw`now()` })
      .where(eq(companies.id, id));
  });

  if (state.error) return state;

  revalidatePath("/", "layout");
  redirect("/settings");
}
