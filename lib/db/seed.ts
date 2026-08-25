/**
 * Datos de ejemplo, calcados de la factura de referencia FAC0010A7.
 *
 *   pnpm db:seed
 *
 * Es idempotente: si la compañía ya existe, no vuelve a insertarla.
 */
import { eq } from "drizzle-orm";
import { db, sql } from "@/lib/db";
import { clients, companies, subscriptionItems, subscriptions } from "@/lib/db/schema";
import { inferAnchorDay } from "@/lib/recurrence";

async function seed() {
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.name, "Neurosoft"))
    .limit(1);

  if (existing.length > 0) {
    console.log("La compañía de ejemplo ya existe, no se hace nada.");
    return;
  }

  const [company] = await db
    .insert(companies)
    .values({
      name: "Neurosoft",
      legalName: "Neurosoft SRL",
      rnc: "131-00000-1",
      addressLine: "CALLE PALMA LINDA NUM. W4",
      city: "Santiago",
      postalCode: "51000",
      region: "Dominican Rep. reg.",
      country: "República Dominicana",
      phone: "8294513026",
      email: "support@neurosoft.dev",
      defaultCurrency: "USD",
      defaultTaxRate: 0,
      defaultPaymentTermsDays: 0,
      defaultPaymentMethod: "Por defecto",
      invoicePrefix: "FAC",
      invoiceSeries: "General",
      // La factura de referencia es la número 7 de la serie y el documento
      // 0x10A7 (4263) del contador global.
      docCounter: 4263,
      seriesCounter: 7,
      numberFormat: "hex",
      isDefault: true,
    })
    .returning();

  const [client] = await db
    .insert(clients)
    .values({
      companyId: company.id,
      name: "Operational Excellence Solutions",
      rnc: "130-87881-1",
      email: "cuentas@example.com",
      addressLine: "Dir. C/Rafael A. Sanchez 39, Piantini, Sto.Dgo",
      city: "Santo Domingo",
      country: "República Dominicana",
      currency: "USD",
      paymentTermsDays: 0,
      active: true,
    })
    .returning();

  const startDate = "2026-08-23";
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      companyId: company.id,
      clientId: client.id,
      name: "Mantenimiento Eugenia",
      currency: "USD",
      taxRate: 0,
      interval: "monthly",
      intervalCount: 1,
      anchorDay: inferAnchorDay(startDate, "monthly"),
      startDate,
      nextRunDate: startDate,
      status: "active",
      autoIssue: true,
      paymentMethod: "Por defecto",
      paymentTermsDays: 0,
      notes: "Contrato de mantenimiento mensual.",
    })
    .returning();

  await db.insert(subscriptionItems).values({
    subscriptionId: subscription.id,
    description: "Mantenimiento Eugenia",
    quantity: 1,
    unitPrice: 75,
    taxRate: 0,
    position: 0,
  });

  // Un segundo cliente con ITBIS y vencimiento a 30 días, para ver la app
  // con más de un escenario.
  const [client2] = await db
    .insert(clients)
    .values({
      companyId: company.id,
      name: "Caribe Logistics SRL",
      rnc: "101-55512-3",
      email: "pagos@example.com",
      addressLine: "Av. Winston Churchill 1099, Piantini, Sto.Dgo",
      city: "Santo Domingo",
      country: "República Dominicana",
      currency: "DOP",
      paymentTermsDays: 30,
      taxRate: 18,
      active: true,
    })
    .returning();

  const start2 = "2026-09-01";
  const [subscription2] = await db
    .insert(subscriptions)
    .values({
      companyId: company.id,
      clientId: client2.id,
      name: "Soporte y hosting mensual",
      currency: "DOP",
      taxRate: 18,
      interval: "monthly",
      intervalCount: 1,
      anchorDay: 1,
      startDate: start2,
      nextRunDate: start2,
      status: "active",
      autoIssue: true,
      paymentMethod: "Transferencia",
      paymentTermsDays: 30,
    })
    .returning();

  await db.insert(subscriptionItems).values([
    {
      subscriptionId: subscription2.id,
      reference: "SOP-001",
      description: "Soporte técnico mensual (20 horas)",
      quantity: 20,
      unitPrice: 1500,
      taxRate: 18,
      position: 0,
    },
    {
      subscriptionId: subscription2.id,
      reference: "HOST-01",
      description: "Hosting y respaldo diario",
      quantity: 1,
      unitPrice: 4500,
      taxRate: 18,
      position: 1,
    },
  ]);

  console.log("Datos de ejemplo listos:");
  console.log(`  compañía   ${company.name} (${company.id})`);
  console.log(`  clientes   ${client.name}, ${client2.name}`);
  console.log(`  recurrencias ${subscription.name}, ${subscription2.name}`);
}

seed()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
