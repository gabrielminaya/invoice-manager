import { cookies } from "next/headers";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, type Company } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";

export const ACTIVE_COMPANY_COOKIE = "companyId";

export async function listCompanies(): Promise<Company[]> {
  await requireUser();

  return db
    .select()
    .from(companies)
    .orderBy(desc(companies.isDefault), asc(companies.name));
}

export async function getCompanyById(id: string): Promise<Company | null> {
  await requireUser();

  const [found] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return found ?? null;
}

/**
 * Compañía activa: la que el usuario eligió (cookie) o, si no hay elección
 * válida, la marcada como predeterminada. Con varias compañías, cambiar de
 * emisor es solo cambiar esta cookie.
 */
export async function getActiveCompany(): Promise<Company | null> {
  await requireUser();

  const store = await cookies();
  const selectedId = store.get(ACTIVE_COMPANY_COOKIE)?.value;

  if (selectedId) {
    const [found] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, selectedId))
      .limit(1);
    if (found) return found;
  }

  const all = await listCompanies();
  return all[0] ?? null;
}
