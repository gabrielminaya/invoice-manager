CREATE TYPE "public"."currency" AS ENUM('DOP', 'USD', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."number_format" AS ENUM('hex', 'decimal');--> statement-breakpoint
CREATE TYPE "public"."recurrence_interval" AS ENUM('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled', 'finished');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rnc" text,
	"email" text,
	"phone" text,
	"address_line" text,
	"city" text,
	"country" text,
	"currency" "currency",
	"payment_terms_days" integer,
	"tax_rate" numeric(5, 2),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"rnc" text,
	"address_line" text,
	"city" text,
	"postal_code" text,
	"region" text,
	"country" text DEFAULT 'República Dominicana' NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"logo_url" text,
	"default_currency" "currency" DEFAULT 'DOP' NOT NULL,
	"default_tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"default_payment_terms_days" integer DEFAULT 0 NOT NULL,
	"default_payment_method" text DEFAULT 'Por defecto' NOT NULL,
	"invoice_prefix" text DEFAULT 'FAC' NOT NULL,
	"invoice_series" text DEFAULT 'General' NOT NULL,
	"doc_counter" integer DEFAULT 0 NOT NULL,
	"series_counter" integer DEFAULT 0 NOT NULL,
	"number_format" "number_format" DEFAULT 'hex' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"as_of_date" date NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"triggered_by" text
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reference" text,
	"description" text NOT NULL,
	"quantity" numeric(14, 4) DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid,
	"number" text NOT NULL,
	"series" text DEFAULT 'General' NOT NULL,
	"series_number" integer NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" "currency" NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"payment_method" text,
	"notes" text,
	"period_key" text,
	"period_start" date,
	"period_end" date,
	"company_snapshot" jsonb,
	"client_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"generated_by_cron" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_number" integer DEFAULT 1 NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text DEFAULT 'Por defecto' NOT NULL,
	"due_date" date,
	"paid_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"reference" text,
	"description" text NOT NULL,
	"quantity" numeric(14, 4) DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" "currency" DEFAULT 'DOP' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"interval" "recurrence_interval" DEFAULT 'monthly' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"anchor_day" integer,
	"start_date" date NOT NULL,
	"next_run_date" date NOT NULL,
	"end_date" date,
	"last_run_date" date,
	"max_occurrences" integer,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"auto_issue" boolean DEFAULT true NOT NULL,
	"payment_method" text,
	"payment_terms_days" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_company_idx" ON "clients" USING btree ("company_id","active");--> statement-breakpoint
CREATE INDEX "cron_runs_started_idx" ON "cron_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unq" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_period_unq" ON "invoices" USING btree ("subscription_id","period_key");--> statement-breakpoint
CREATE INDEX "invoices_company_date_idx" ON "invoices" USING btree ("company_id","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "subscription_items_sub_idx" ON "subscription_items" USING btree ("subscription_id","position");--> statement-breakpoint
CREATE INDEX "subscriptions_due_idx" ON "subscriptions" USING btree ("status","next_run_date");--> statement-breakpoint
CREATE INDEX "subscriptions_client_idx" ON "subscriptions" USING btree ("client_id");