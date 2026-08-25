import { and, asc, count, desc, eq, ilike, inArray, or, sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  companies,
  cronRuns,
  invoiceItems,
  invoices,
  payments,
  subscriptionItems,
  sessions,
  subscriptions,
  users,
  type Client,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { requireUser } from "@/lib/auth/dal";

/* ------------------------------------------------------------------ *
 * Usuarios
 * ------------------------------------------------------------------ */

export async function listUsers() {
  await requireUser();

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      /** Sesiones vigentes: da idea de en cuántos dispositivos está entrado. */
      activeSessions: raw<number>`(
        select count(*) from ${sessions} s
        where s.user_id = "users"."id" and s.expires_at > now()
      )`.mapWith(Number),
    })
    .from(users)
    .orderBy(desc(users.active), asc(users.name));
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

/* ------------------------------------------------------------------ *
 * Clientes
 * ------------------------------------------------------------------ */

/**
 * NOTA sobre las subconsultas correlacionadas de este archivo:
 *
 * Drizzle solo cualifica las columnas con el nombre de su tabla cuando la
 * consulta tiene `join`. En una consulta sin joins, `${clients.id}` se
 * interpola como `"id"` a secas y, dentro de una subconsulta, Postgres lo
 * resuelve contra la tabla interna —que también tiene una columna `id`—. El
 * resultado es una comparación siempre falsa, sin error.
 *
 * Por eso las subconsultas de abajo usan alias para la tabla interna y el
 * nombre cualificado literal para la externa.
 */
export async function listClients(companyId: string, search?: string) {
  await requireUser();

  const filters = [eq(clients.companyId, companyId)];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    filters.push(or(ilike(clients.name, term), ilike(clients.rnc, term))!);
  }

  return db
    .select({
      id: clients.id,
      name: clients.name,
      rnc: clients.rnc,
      email: clients.email,
      phone: clients.phone,
      addressLine: clients.addressLine,
      currency: clients.currency,
      paymentTermsDays: clients.paymentTermsDays,
      taxRate: clients.taxRate,
      active: clients.active,
      subscriptionCount: raw<number>`(
        select count(*) from ${subscriptions} sub
        where sub.client_id = "clients"."id" and sub.status = 'active'
      )`.mapWith(Number),
      outstanding: raw<number>`coalesce((
        select sum(inv.total - inv.amount_paid) from ${invoices} inv
        where inv.client_id = "clients"."id"
          and inv.status in ('issued','overdue')
      ), 0)`.mapWith(Number),
    })
    .from(clients)
    .where(and(...filters))
    .orderBy(desc(clients.active), asc(clients.name));
}

/**
 * Clientes activos de todas las compañías, para los formularios que permiten
 * elegir la compañía emisora: al cambiarla hay que filtrar los clientes sin
 * volver al servidor.
 */
export async function listActiveClientsAcrossCompanies() {
  await requireUser();

  return db
    .select({
      id: clients.id,
      companyId: clients.companyId,
      name: clients.name,
      currency: clients.currency,
      paymentTermsDays: clients.paymentTermsDays,
      taxRate: clients.taxRate,
    })
    .from(clients)
    .where(and(eq(clients.active, true)))
    .orderBy(asc(clients.name));
}

export type ClientChoiceRow = Awaited<ReturnType<typeof listActiveClientsAcrossCompanies>>[number];

export async function getClient(id: string): Promise<Client | null> {
  await requireUser();

  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ *
 * Recurrencias
 * ------------------------------------------------------------------ */

export async function listSubscriptions(companyId: string, status?: "active" | "paused" | "all") {
  await requireUser();

  const filters = [eq(subscriptions.companyId, companyId)];
  if (status && status !== "all") filters.push(eq(subscriptions.status, status));

  return db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      status: subscriptions.status,
      interval: subscriptions.interval,
      intervalCount: subscriptions.intervalCount,
      currency: subscriptions.currency,
      nextRunDate: subscriptions.nextRunDate,
      lastRunDate: subscriptions.lastRunDate,
      endDate: subscriptions.endDate,
      occurrences: subscriptions.occurrences,
      maxOccurrences: subscriptions.maxOccurrences,
      autoIssue: subscriptions.autoIssue,
      clientId: clients.id,
      clientName: clients.name,
      /* Importe del ciclo, calculado desde los conceptos con su ITBIS. */
      cycleTotal: raw<number>`coalesce((
        select sum(round(${subscriptionItems.unitPrice} * ${subscriptionItems.quantity}
                    * (1 + ${subscriptionItems.taxRate} / 100), 2))
        from ${subscriptionItems}
        where ${subscriptionItems.subscriptionId} = ${subscriptions.id}
      ), 0)`.mapWith(Number),
    })
    .from(subscriptions)
    .innerJoin(clients, eq(clients.id, subscriptions.clientId))
    .where(and(...filters))
    .orderBy(asc(subscriptions.nextRunDate));
}

export type SubscriptionListRow = Awaited<ReturnType<typeof listSubscriptions>>[number];

export async function getSubscriptionDetail(id: string) {
  await requireUser();

  const [row] = await db
    .select({
      subscription: subscriptions,
      client: clients,
      company: companies,
    })
    .from(subscriptions)
    .innerJoin(clients, eq(clients.id, subscriptions.clientId))
    .innerJoin(companies, eq(companies.id, subscriptions.companyId))
    .where(eq(subscriptions.id, id))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, id))
    .orderBy(asc(subscriptionItems.position));

  const generated = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      issueDate: invoices.issueDate,
      total: invoices.total,
      currency: invoices.currency,
      status: invoices.status,
    })
    .from(invoices)
    .where(eq(invoices.subscriptionId, id))
    .orderBy(desc(invoices.issueDate))
    .limit(24);

  return { ...row, items, generated };
}

/* ------------------------------------------------------------------ *
 * Facturas
 * ------------------------------------------------------------------ */

export type InvoiceFilter = "all" | InvoiceStatus | "unpaid";

const UNPAID: InvoiceStatus[] = ["issued", "overdue"];

export async function listInvoices(
  companyId: string,
  options: { filter?: InvoiceFilter; search?: string; limit?: number } = {},
) {
  await requireUser();

  const filters = [eq(invoices.companyId, companyId)];

  if (options.filter === "unpaid") filters.push(inArray(invoices.status, UNPAID));
  else if (options.filter && options.filter !== "all")
    filters.push(eq(invoices.status, options.filter));

  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    filters.push(or(ilike(invoices.number, term), ilike(clients.name, term))!);
  }

  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      currency: invoices.currency,
      status: invoices.status,
      generatedByCron: invoices.generatedByCron,
      clientName: clients.name,
      clientId: clients.id,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(...filters))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .limit(options.limit ?? 100);
}

export type InvoiceListRow = Awaited<ReturnType<typeof listInvoices>>[number];

export async function getInvoiceDetail(id: string) {
  await requireUser();

  const [row] = await db
    .select({ invoice: invoices, client: clients, company: companies })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(eq(invoices.id, id))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(asc(invoiceItems.position));

  const receipts = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, id))
    .orderBy(asc(payments.receiptNumber));

  return { ...row, items, receipts };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

export async function getInvoicesByClient(clientId: string, limit = 20): Promise<Invoice[]> {
  await requireUser();

  return db
    .select()
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
    .orderBy(desc(invoices.issueDate))
    .limit(limit);
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

export type DashboardSummary = {
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
  draftCount: number;
  invoiceCount: number;
  activeSubscriptions: number;
  clientCount: number;
  dueSoon: SubscriptionListRow[];
  overdueNow: number;
  recent: InvoiceListRow[];
  lastCronRun: { startedAt: Date; createdCount: number; errorCount: number; dryRun: boolean } | null;
};

export async function getDashboardSummary(
  companyId: string,
  today: ISODate,
): Promise<DashboardSummary> {
  await requireUser();

  const monthStart = `${today.slice(0, 7)}-01`;

  const [totals] = await db
    .select({
      outstanding: raw<number>`coalesce(sum(case when ${invoices.status} in ('issued','overdue')
        then ${invoices.total} - ${invoices.amountPaid} else 0 end), 0)`.mapWith(Number),
      overdue: raw<number>`coalesce(sum(case when ${invoices.status} = 'overdue'
        then ${invoices.total} - ${invoices.amountPaid} else 0 end), 0)`.mapWith(Number),
      overdueNow: raw<number>`count(*) filter (where ${invoices.status} = 'overdue')`.mapWith(Number),
      draftCount: raw<number>`count(*) filter (where ${invoices.status} = 'draft')`.mapWith(Number),
      invoiceCount: raw<number>`count(*)`.mapWith(Number),
      paidThisMonth: raw<number>`coalesce(sum(case when ${invoices.status} = 'paid'
        and ${invoices.issueDate} >= ${monthStart} then ${invoices.total} else 0 end), 0)`.mapWith(Number),
    })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));

  const [counters] = await db
    .select({
      activeSubscriptions: raw<number>`count(*) filter (where ${subscriptions.status} = 'active')`.mapWith(Number),
    })
    .from(subscriptions)
    .where(eq(subscriptions.companyId, companyId));

  const [clientCounter] = await db
    .select({ total: count() })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.active, true)));

  const horizon = addDays(today, 7);
  const all = await listSubscriptions(companyId, "active");
  const dueSoon = all.filter((s) => s.nextRunDate <= horizon);

  const recent = await listInvoices(companyId, { limit: 5 });

  const [lastRun] = await db
    .select({
      startedAt: cronRuns.startedAt,
      createdCount: cronRuns.createdCount,
      errorCount: cronRuns.errorCount,
      dryRun: cronRuns.dryRun,
    })
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);

  return {
    outstanding: totals?.outstanding ?? 0,
    overdue: totals?.overdue ?? 0,
    paidThisMonth: totals?.paidThisMonth ?? 0,
    draftCount: totals?.draftCount ?? 0,
    invoiceCount: totals?.invoiceCount ?? 0,
    overdueNow: totals?.overdueNow ?? 0,
    activeSubscriptions: counters?.activeSubscriptions ?? 0,
    clientCount: clientCounter?.total ?? 0,
    dueSoon,
    recent,
    lastCronRun: lastRun ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Bitácora del cron
 * ------------------------------------------------------------------ */

export async function listCronRuns(limit = 10) {
  await requireUser();

  return db
    .select({
      id: cronRuns.id,
      startedAt: cronRuns.startedAt,
      finishedAt: cronRuns.finishedAt,
      asOfDate: cronRuns.asOfDate,
      dryRun: cronRuns.dryRun,
      createdCount: cronRuns.createdCount,
      skippedCount: cronRuns.skippedCount,
      errorCount: cronRuns.errorCount,
      triggeredBy: cronRuns.triggeredBy,
    })
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(limit);
}
