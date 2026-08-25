import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";

/** El cliente no existe, o pertenece a otra compañía emisora. */
export class ClientCompanyMismatchError extends Error {
  constructor() {
    super("El cliente no existe o no pertenece a esta compañía");
    this.name = "ClientCompanyMismatchError";
  }
}

export async function clientBelongsToCompany(
  clientId: string,
  companyId: string,
): Promise<boolean> {
  const [found] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))
    .limit(1);
  return Boolean(found);
}

/**
 * Regla de dominio: una recurrencia solo puede facturar a un cliente de su
 * propia compañía emisora.
 *
 * Sin esta comprobación, una petición manipulada podría atar un cliente de otra
 * compañía a la recurrencia: la factura fallaría después en `insertInvoice` y el
 * cronjob arrastraría el error en cada corrida.
 */
export async function assertClientBelongsToCompany(
  clientId: string,
  companyId: string,
): Promise<void> {
  if (!(await clientBelongsToCompany(clientId, companyId))) {
    throw new ClientCompanyMismatchError();
  }
}
