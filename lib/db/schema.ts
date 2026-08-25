import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 * Tipos enumerados
 * ------------------------------------------------------------------ */

export const currencyEnum = pgEnum("currency", ["DOP", "USD", "EUR"]);

export const recurrenceIntervalEnum = pgEnum("recurrence_interval", [
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "paused",
  "cancelled",
  "finished",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "overdue",
  "void",
]);

export const numberFormatEnum = pgEnum("number_format", ["hex", "decimal"]);

/* ------------------------------------------------------------------ *
 * Columnas reutilizables
 *
 * El dinero se guarda como numeric(14,2) para que Postgres sea la fuente
 * de verdad exacta. En TypeScript se opera siempre en centavos
 * (ver lib/money.ts) y se redondea antes de escribir.
 * ------------------------------------------------------------------ */

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const rate = (name: string) => numeric(name, { precision: 5, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });

/* ------------------------------------------------------------------ *
 * Usuarios y sesiones
 * ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** scrypt con sal por usuario. Nunca se guarda la contraseña en claro. */
    passwordHash: text("password_hash").notNull(),
    /** Desactivar en lugar de borrar conserva el rastro de quién hizo qué. */
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** El correo identifica al usuario; se guarda siempre en minúsculas. */
    uniqueIndex("users_email_unq").on(t.email),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /**
     * Hash SHA-256 del token que viaja en la cookie, no el token.
     *
     * Así una copia de la base de datos no permite suplantar sesiones: el valor
     * guardado no sirve como credencial.
     */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Contexto de la sesión, para poder reconocerla al revisar accesos. */
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Compañías (emisores de factura)
 * ------------------------------------------------------------------ */

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Nombre comercial, el que se imprime grande en la factura. */
  name: text("name").notNull(),
  /** Razón social, si difiere del comercial. */
  legalName: text("legal_name"),
  /** RNC / cédula / tax id del emisor. */
  rnc: text("rnc"),

  addressLine: text("address_line"),
  city: text("city"),
  postalCode: text("postal_code"),
  region: text("region"),
  country: text("country").notNull().default("República Dominicana"),

  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  /** URL o data-URI del logo mostrado en la cabecera de la factura. */
  logoUrl: text("logo_url"),

  defaultCurrency: currencyEnum("default_currency").notNull().default("DOP"),
  /** ITBIS por defecto en porcentaje (18.00 = 18%). */
  defaultTaxRate: rate("default_tax_rate").notNull().default(0),
  /** Días entre fecha de emisión y vencimiento. 0 = vence el mismo día. */
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(0),
  defaultPaymentMethod: text("default_payment_method").notNull().default("Por defecto"),

  /** Prefijo del número de factura: FAC0010A7 -> "FAC". */
  invoicePrefix: text("invoice_prefix").notNull().default("FAC"),
  /** Serie fiscal impresa en la factura ("General"). */
  invoiceSeries: text("invoice_series").notNull().default("General"),
  /**
   * Contador global de documentos. Se codifica en el número visible:
   * 4263 -> hex 10A7 -> "FAC0010A7".
   */
  docCounter: integer("doc_counter").notNull().default(0),
  /** Contador por serie, es el "Número: 7" de la factura. */
  seriesCounter: integer("series_counter").notNull().default(0),
  numberFormat: numberFormatEnum("number_format").notNull().default("hex"),

  /** Compañía preseleccionada en la app. */
  isDefault: boolean("is_default").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Clientes
 * ------------------------------------------------------------------ */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    rnc: text("rnc"),
    email: text("email"),
    /**
     * Direcciones en copia, separadas por comas. Se normalizan al guardar
     * (ver `lib/form.ts`) y viajan en el CC de todo correo dirigido al cliente.
     */
    emailCc: text("email_cc"),
    phone: text("phone"),

    /** Dirección en una línea, tal como se imprime en la factura. */
    addressLine: text("address_line"),
    city: text("city"),
    country: text("country"),

    /** Si es null, se hereda de la compañía. */
    currency: currencyEnum("currency"),
    paymentTermsDays: integer("payment_terms_days"),
    taxRate: rate("tax_rate"),

    notes: text("notes"),
    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_company_idx").on(t.companyId, t.active)],
);

/* ------------------------------------------------------------------ *
 * Suscripciones = plantillas de facturación recurrente
 * ------------------------------------------------------------------ */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    /** Nombre interno del contrato, p.ej. "Mantenimiento Eugenia". */
    name: text("name").notNull(),
    currency: currencyEnum("currency").notNull().default("DOP"),
    taxRate: rate("tax_rate").notNull().default(0),

    interval: recurrenceIntervalEnum("interval").notNull().default("monthly"),
    /** Cada cuántos intervalos se factura (2 + monthly = bimestral). */
    intervalCount: integer("interval_count").notNull().default(1),
    /**
     * Día de anclaje. Para intervalos mensuales o mayores es el día del mes
     * (1-31, se recorta al último día del mes cuando no existe).
     * Para "weekly" es el día de la semana (0 = domingo).
     */
    anchorDay: integer("anchor_day"),

    startDate: date("start_date").notNull(),
    /** Próxima fecha en la que el cron debe emitir. Es el corazón de la recurrencia. */
    nextRunDate: date("next_run_date").notNull(),
    endDate: date("end_date"),
    lastRunDate: date("last_run_date"),

    /** Límite opcional de facturas a emitir. */
    maxOccurrences: integer("max_occurrences"),
    occurrences: integer("occurrences").notNull().default(0),

    status: subscriptionStatusEnum("status").notNull().default("active"),

    /** true = la factura nace emitida; false = nace en borrador para revisión. */
    autoIssue: boolean("auto_issue").notNull().default(true),

    paymentMethod: text("payment_method"),
    paymentTermsDays: integer("payment_terms_days"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** El cron barre por aquí: status + nextRunDate. */
    index("subscriptions_due_idx").on(t.status, t.nextRunDate),
    index("subscriptions_client_idx").on(t.clientId),
  ],
);

export const subscriptionItems = pgTable(
  "subscription_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),

    reference: text("reference"),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull().default(1),
    unitPrice: money("unit_price").notNull(),
    taxRate: rate("tax_rate").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("subscription_items_sub_idx").on(t.subscriptionId, t.position)],
);

/* ------------------------------------------------------------------ *
 * Facturas
 * ------------------------------------------------------------------ */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Null en facturas creadas a mano. */
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),

    /** Número visible: "FAC0010A7". */
    number: text("number").notNull(),
    series: text("series").notNull().default("General"),
    seriesNumber: integer("series_number").notNull(),

    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),

    currency: currencyEnum("currency").notNull(),
    subtotal: money("subtotal").notNull().default(0),
    taxTotal: money("tax_total").notNull().default(0),
    total: money("total").notNull().default(0),
    amountPaid: money("amount_paid").notNull().default(0),

    status: invoiceStatusEnum("status").notNull().default("draft"),
    paymentMethod: text("payment_method"),
    notes: text("notes"),

    /**
     * Clave del período facturado ("2026-07"). Junto a subscriptionId forma
     * la garantía de idempotencia del cron: un período no se factura dos veces.
     */
    periodKey: text("period_key"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),

    /* Copia congelada de los datos fiscales al momento de emitir. Si el
     * cliente cambia de dirección, las facturas viejas no se alteran. */
    companySnapshot: jsonb("company_snapshot"),
    clientSnapshot: jsonb("client_snapshot"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Marca las facturas creadas por el cronjob. */
    generatedByCron: boolean("generated_by_cron").notNull().default(false),
  },
  (t) => [
    uniqueIndex("invoices_number_unq").on(t.number),
    /** Idempotencia de la recurrencia. */
    uniqueIndex("invoices_period_unq").on(t.subscriptionId, t.periodKey),
    index("invoices_company_date_idx").on(t.companyId, t.issueDate),
    index("invoices_client_idx").on(t.clientId),
    index("invoices_status_idx").on(t.status, t.dueDate),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    reference: text("reference"),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull().default(1),
    unitPrice: money("unit_price").notNull(),
    taxRate: rate("tax_rate").notNull().default(0),
    /** Neto de la línea = cantidad * precio (la columna "Neto" del PDF). */
    net: money("net").notNull(),
    taxAmount: money("tax_amount").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId, t.position)],
);

/* ------------------------------------------------------------------ *
 * Recibos / pagos
 * ------------------------------------------------------------------ */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    /** El "Recibo: 1" del PDF. Correlativo dentro de la factura. */
    receiptNumber: integer("receipt_number").notNull().default(1),
    amount: money("amount").notNull(),
    method: text("method").notNull().default("Por defecto"),
    dueDate: date("due_date"),
    paidDate: date("paid_date"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

/* ------------------------------------------------------------------ *
 * Bitácora del cronjob
 * ------------------------------------------------------------------ */

export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Fecha lógica usada para decidir qué vence (permite simular). */
    asOfDate: date("as_of_date").notNull(),
    dryRun: boolean("dry_run").notNull().default(false),
    createdCount: integer("created_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    /** Detalle por suscripción, útil para depurar sin tocar la base. */
    details: jsonb("details"),
    triggeredBy: text("triggered_by"),
  },
  (t) => [index("cron_runs_started_idx").on(t.startedAt)],
);

/* ------------------------------------------------------------------ *
 * Relaciones (para la query API de Drizzle)
 * ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  clients: many(clients),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  company: one(companies, { fields: [clients.companyId], references: [companies.id] }),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  company: one(companies, { fields: [subscriptions.companyId], references: [companies.id] }),
  client: one(clients, { fields: [subscriptions.clientId], references: [clients.id] }),
  items: many(subscriptionItems),
  invoices: many(invoices),
}));

export const subscriptionItemsRelations = relations(subscriptionItems, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionItems.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));

/* ------------------------------------------------------------------ *
 * Tipos inferidos
 * ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionItem = typeof subscriptionItems.$inferSelect;
export type NewSubscriptionItem = typeof subscriptionItems.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type CronRun = typeof cronRuns.$inferSelect;

export type Currency = (typeof currencyEnum.enumValues)[number];
export type RecurrenceInterval = (typeof recurrenceIntervalEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
