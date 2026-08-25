"use server";

import { revalidatePath } from "next/cache";
import { runRecurringBilling } from "@/lib/services/recurring";
import * as f from "@/lib/form";
import { requireUser } from "@/lib/auth/dal";

/**
 * Ejecuta el motor de recurrencia desde la UI de ajustes.
 *
 * Sirve para probar la automatización sin esperar al cronjob ni manejar el
 * secreto: la sesión de la app ya está autenticada por definición, mientras
 * que el endpoint HTTP exige CRON_SECRET porque lo llama un tercero.
 */
export async function runCronFromUi(formData: FormData) {
  await requireUser();

  const dryRun = f.bool(formData, "dryRun");

  await runRecurringBilling({
    dryRun,
    triggeredBy: dryRun ? "ui:simulacion" : "ui:ejecucion-manual",
  });

  revalidatePath("/", "layout");
}
