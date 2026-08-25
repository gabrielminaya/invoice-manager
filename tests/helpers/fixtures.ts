import { db } from "@/lib/db";
import {
  clients,
  companies,
  subscriptionItems,
  subscriptions,
  type Client,
  type Company,
  type Currency,
  type RecurrenceInterval,
  type Subscription,
} from "@/lib/db/schema";
import { inferAnchorDay } from "@/lib/recurrence";

/**
 * Fixtures mínimas para las pruebas de integración.
 *
 * Los valores por defecto reproducen la factura de referencia (Neurosoft,
 * serie General, contador 4263 -> FAC0010A7) para que las pruebas de numeración
 * comprueben el formato real y no uno inventado.
 */

export async function createCompany(overrides: Partial<Company> = {}): Promise<Company> {
  const [company] = await db
    .insert(companies)
    .values({
      name: "Neurosoft",
      rnc: "131-00000-1",
      addressLine: "CALLE PALMA LINDA NUM. W4",
      city: "Santiago",
      country: "República Dominicana",
      email: "support@neurosoft.dev",
      defaultCurrency: "USD",
      defaultTaxRate: 0,
      defaultPaymentTermsDays: 0,
      defaultPaymentMethod: "Por defecto",
      invoicePrefix: "FAC",
      invoiceSeries: "General",
      docCounter: 4263,
      seriesCounter: 7,
      numberFormat: "hex",
      isDefault: true,
      ...overrides,
    })
    .returning();
  return company;
}

export async function createClient(
  companyId: string,
  overrides: Partial<Client> = {},
): Promise<Client> {
  const [client] = await db
    .insert(clients)
    .values({
      companyId,
      name: "Operational Excellence Solutions",
      rnc: "130-87881-1",
      email: "cuentas@example.com",
      addressLine: "C/Rafael A. Sanchez 39, Piantini",
      city: "Santo Domingo",
      country: "República Dominicana",
      currency: "USD",
      paymentTermsDays: 0,
      active: true,
      ...overrides,
    })
    .returning();
  return client;
}

export type SubscriptionSeed = {
  startDate?: string;
  nextRunDate?: string;
  interval?: RecurrenceInterval;
  intervalCount?: number;
  currency?: Currency;
  taxRate?: number;
  autoIssue?: boolean;
  endDate?: string | null;
  maxOccurrences?: number | null;
  paymentTermsDays?: number | null;
  /** Sin conceptos, para probar el aislamiento de errores del cron. */
  withoutItems?: boolean;
  items?: { description: string; quantity: number; unitPrice: number; taxRate: number }[];
};

export async function createSubscription(
  companyId: string,
  clientId: string,
  seed: SubscriptionSeed = {},
): Promise<Subscription> {
  const startDate = seed.startDate ?? "2026-08-23";
  const interval = seed.interval ?? "monthly";

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      companyId,
      clientId,
      name: "Mantenimiento Eugenia",
      currency: seed.currency ?? "USD",
      taxRate: seed.taxRate ?? 0,
      interval,
      intervalCount: seed.intervalCount ?? 1,
      anchorDay: inferAnchorDay(startDate, interval),
      startDate,
      nextRunDate: seed.nextRunDate ?? startDate,
      endDate: seed.endDate ?? null,
      maxOccurrences: seed.maxOccurrences ?? null,
      status: "active",
      autoIssue: seed.autoIssue ?? true,
      paymentMethod: "Por defecto",
      paymentTermsDays: seed.paymentTermsDays ?? null,
    })
    .returning();

  if (!seed.withoutItems) {
    const items = seed.items ?? [
      { description: "Mantenimiento Eugenia", quantity: 1, unitPrice: 75, taxRate: seed.taxRate ?? 0 },
    ];
    await db.insert(subscriptionItems).values(
      items.map((item, index) => ({ ...item, subscriptionId: subscription.id, position: index })),
    );
  }

  return subscription;
}

/** Compañía + cliente + recurrencia lista para facturar. */
export async function createScenario(seed: SubscriptionSeed = {}) {
  const company = await createCompany();
  const client = await createClient(company.id);
  const subscription = await createSubscription(company.id, client.id, seed);
  return { company, client, subscription };
}
