// Dihasilkan otomatis oleh scripts/bundle-sql.mjs (npm run db:bundle). JANGAN diedit manual.
export type BundledMigration = { id: string; checksum: string; sql: string };
export const BUNDLED_MIGRATIONS: BundledMigration[] = [
  { id: '0000_baseline', checksum: '167f277175fde37ec43c9200cc60daa91c4a96e551f323e8069c792615a20622', sql: `CREATE TABLE IF NOT EXISTS "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"location" text,
	"assigned_to" text,
	"purchase_date" date,
	"cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"useful_life_months" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"check_in" text,
	"check_out" text,
	"status" text DEFAULT 'hadir' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"device_id" uuid,
	"operator" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"client_id" uuid,
	"customer_name" text NOT NULL,
	"service" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_range" CHECK ("bookings"."ends_at" > "bookings"."starts_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"address" text,
	"is_main" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"trade_name" text,
	"slogan" text,
	"description" text,
	"template_key" text DEFAULT 'other' NOT NULL,
	"business_model" text,
	"industry" text,
	"status" text DEFAULT 'active' NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"language" text DEFAULT 'id' NOT NULL,
	"date_format" text DEFAULT 'DD/MM/YYYY' NOT NULL,
	"country" text,
	"province" text,
	"city" text,
	"address" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel" text,
	"budget" numeric(18, 2) DEFAULT '0' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"result_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"coa_account_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"opening_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"expected_amount" numeric(18, 2),
	"counted_amount" numeric(18, 2),
	"variance" numeric(18, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"device_id" uuid,
	"operator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'individual' NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"industry" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text,
	"notes" text,
	"merged_into_id" uuid,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coa_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"name" text DEFAULT 'Perangkat' NOT NULL,
	"operator_name" text,
	"pin_hash" text,
	"pin_length" integer,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doc_counters" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "doc_counters_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"position" text,
	"department" text,
	"phone" text,
	"email" text,
	"hire_date" date,
	"salary" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"coa_account_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"category_id" uuid,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"tx_date" date NOT NULL,
	"tx_time" text,
	"note" text,
	"reference" text,
	"client_id" uuid,
	"supplier_name" text,
	"project_id" uuid,
	"journal_id" uuid,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"device_id" uuid,
	"operator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ft_amount_pos" CHECK ("finance_transactions"."amount" > 0),
	CONSTRAINT "ft_transfer_diff" CHECK ("finance_transactions"."type" <> 'transfer' OR "finance_transactions"."to_account_id" IS NOT NULL AND "finance_transactions"."to_account_id" <> "finance_transactions"."account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"unit_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"number" text NOT NULL,
	"client_id" uuid,
	"channel" text DEFAULT 'pos' NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cogs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"journal_id" uuid,
	"due_date" date,
	"note" text,
	"device_id" uuid,
	"operator" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inv_paid_range" CHECK ("invoices"."paid" >= 0 AND "invoices"."paid" <= "invoices"."total")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"number" text NOT NULL,
	"entry_date" date NOT NULL,
	"memo" text,
	"source" text NOT NULL,
	"source_id" uuid,
	"status" text DEFAULT 'posted' NOT NULL,
	"reverses_id" uuid,
	"reversed_by_id" uuid,
	"device_id" uuid,
	"operator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"memo" text,
	CONSTRAINT "jl_amounts" CHECK ("journal_lines"."debit" >= 0 AND "journal_lines"."credit" >= 0 AND NOT ("journal_lines"."debit" > 0 AND "journal_lines"."credit" > 0))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"device_id" uuid,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_drafts_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"device_id" uuid,
	"operator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_by_device_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid,
	"bill_id" uuid,
	"account_id" uuid NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reference" text,
	"journal_id" uuid,
	"reversed" boolean DEFAULT false NOT NULL,
	"device_id" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_pos" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'product' NOT NULL,
	"category" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"track_stock" boolean DEFAULT true NOT NULL,
	"reorder_level" numeric(18, 3) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price" CHECK ("products"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"status" text DEFAULT 'planning' NOT NULL,
	"start_date" date,
	"end_date" date,
	"budget" numeric(18, 2) DEFAULT '0' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"received_qty" numeric(18, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "pol_received" CHECK ("purchase_order_lines"."received_qty" <= "purchase_order_lines"."quantity")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" text DEFAULT 'ordered' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"ordered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"note" text,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"po_id" uuid,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_paid" CHECK ("supplier_bills"."paid" >= 0 AND "supplier_bills"."paid" <= "supplier_bills"."total")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tab_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"device_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tab_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"due_date" date,
	"assignee" text,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assets" ADD CONSTRAINT "assets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_booking_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "branches" ADD CONSTRAINT "branches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budgets" ADD CONSTRAINT "budgets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "businesses" ADD CONSTRAINT "businesses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_coa_account_id_coa_accounts_id_fk" FOREIGN KEY ("coa_account_id") REFERENCES "public"."coa_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clients" ADD CONSTRAINT "clients_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coa_accounts" ADD CONSTRAINT "coa_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coa_accounts" ADD CONSTRAINT "coa_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "doc_counters" ADD CONSTRAINT "doc_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_coa_account_id_coa_accounts_id_fk" FOREIGN KEY ("coa_account_id") REFERENCES "public"."coa_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_to_account_id_cash_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_coa_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."coa_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ops_logs" ADD CONSTRAINT "ops_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ops_logs" ADD CONSTRAINT "ops_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_created_by_device_id_devices_id_fk" FOREIGN KEY ("created_by_device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_used_by_device_id_devices_id_fk" FOREIGN KEY ("used_by_device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tab_sessions" ADD CONSTRAINT "tab_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "periods_ws" ON "accounting_periods" USING btree ("workspace_id","start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_ws_created" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_res" ON "bookings" USING btree ("resource_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_cat_month" ON "budgets" USING btree ("workspace_id","category_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_one_open" ON "cash_sessions" USING btree ("workspace_id","account_id") WHERE "cash_sessions"."status" = 'open';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ca_client" ON "client_activities" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clients_ws_code" ON "clients" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coa_ws_code" ON "coa_accounts" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_grants_device_ws" ON "device_grants" USING btree ("device_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ft_ws_number" ON "finance_transactions" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ft_ws_date" ON "finance_transactions" USING btree ("workspace_id","tx_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idem_ws_key" ON "idempotency_keys" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_ws_number" ON "invoices" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_ws_issued" ON "invoices" USING btree ("workspace_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_idem" ON "jobs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_due" ON "jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "je_ws_number" ON "journal_entries" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "je_ws_date" ON "journal_entries" USING btree ("workspace_id","entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jl_entry" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jl_account" ON "journal_lines" USING btree ("workspace_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_documents_kind_version" ON "legal_documents" USING btree ("kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_ws_sku" ON "products" USING btree ("workspace_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "po_ws_number" ON "purchase_orders" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sm_product" ON "stock_movements" USING btree ("workspace_id","product_id","warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bill_ws_number" ON "supplier_bills" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tab_sessions_device" ON "tab_sessions" USING btree ("device_id");` },
  { id: '001_integrity', checksum: '86f9da116df8865562f1c802e698a8286a209f64a41d7d24c27ac7ee4c3c7d2c', sql: `-- Integritas akuntansi (dijalankan eksplisit setelah migrasi; bukan saat startup aplikasi).
-- Jurnal posted immutable: baris jurnal tidak boleh diubah/dihapus; entry hanya boleh berubah status -> reversed.
CREATE OR REPLACE FUNCTION bf_block_journal_line_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'journal_lines is append-only (posted journal immutable)'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bf_jl_immutable ON journal_lines;
CREATE TRIGGER bf_jl_immutable BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION bf_block_journal_line_change();

CREATE OR REPLACE FUNCTION bf_guard_journal_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'journal_entries cannot be deleted'; END IF;
  IF NEW.entry_date <> OLD.entry_date OR NEW.number <> OLD.number OR NEW.workspace_id <> OLD.workspace_id OR NEW.memo IS DISTINCT FROM OLD.memo THEN
    RAISE EXCEPTION 'posted journal entry is immutable (use reversal)'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bf_je_guard ON journal_entries;
CREATE TRIGGER bf_je_guard BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION bf_guard_journal_entry();

-- Stock movements append-only.
CREATE OR REPLACE FUNCTION bf_block_stock_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'stock_movements is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bf_sm_immutable ON stock_movements;
CREATE TRIGGER bf_sm_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION bf_block_stock_change();
` },
  { id: '002_rls_and_tenant_fk', checksum: 'edfc7a495f0265bc198ed43acc2c2ac7829d2af6715f75bcab1d3bce32c475b5', sql: `-- 002_rls_and_tenant_fk.sql
-- Row Level Security (fail-closed) + role runtime bf_app (NOBYPASSRLS) + composite tenant FKs

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bf_app') THEN
    CREATE ROLE bf_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- Izinkan user koneksi saat ini melakukan SET LOCAL ROLE bf_app dalam transaksi
DO $$
BEGIN
  EXECUTE format('GRANT bf_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO bf_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bf_app;

-- Hak akses minimum pada tabel-tabel yang ada
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bf_app;

-- Tabel append-only: cabut UPDATE & DELETE dari role aplikasi
REVOKE UPDATE, DELETE ON TABLE journal_entries, journal_lines, stock_movements, audit_events FROM bf_app;

-- Daftar tabel bertenant yang wajib ENABLE + FORCE ROW LEVEL SECURITY
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'businesses', 'branches', 'warehouses', 'device_grants', 'pairing_codes',
    'legal_acceptances', 'audit_events', 'idempotency_keys', 'doc_counters',
    'notifications', 'coa_accounts', 'cash_accounts', 'finance_categories',
    'accounting_periods', 'journal_entries', 'journal_lines', 'finance_transactions',
    'budgets', 'clients', 'client_contacts', 'client_activities', 'products',
    'stock_movements', 'invoices', 'invoice_lines', 'payments', 'suppliers',
    'purchase_orders', 'purchase_order_lines', 'supplier_bills', 'employees',
    'attendance', 'tasks', 'projects', 'assets', 'campaigns', 'ops_logs',
    'cash_sessions', 'booking_resources', 'bookings'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

-- Composite unique (workspace_id, id) untuk composite FK lintas-tabel yang tenant-aware
DO $$
BEGIN
  ALTER TABLE clients ADD CONSTRAINT uq_clients_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE products ADD CONSTRAINT uq_products_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE invoices ADD CONSTRAINT uq_invoices_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE coa_accounts ADD CONSTRAINT uq_coa_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE journal_entries ADD CONSTRAINT uq_je_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE suppliers ADD CONSTRAINT uq_suppliers_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE purchase_orders ADD CONSTRAINT uq_po_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE booking_resources ADD CONSTRAINT uq_bres_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Composite FK tenant-aware
DO $$
BEGIN
  ALTER TABLE invoice_lines ADD CONSTRAINT fk_inv_lines_ws_inv FOREIGN KEY (workspace_id, invoice_id) REFERENCES invoices (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE journal_lines ADD CONSTRAINT fk_jl_ws_je FOREIGN KEY (workspace_id, entry_id) REFERENCES journal_entries (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE journal_lines ADD CONSTRAINT fk_jl_ws_coa FOREIGN KEY (workspace_id, account_id) REFERENCES coa_accounts (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE client_contacts ADD CONSTRAINT fk_cc_ws_client FOREIGN KEY (workspace_id, client_id) REFERENCES clients (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE client_activities ADD CONSTRAINT fk_ca_ws_client FOREIGN KEY (workspace_id, client_id) REFERENCES clients (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE purchase_order_lines ADD CONSTRAINT fk_pol_ws_po FOREIGN KEY (workspace_id, po_id) REFERENCES purchase_orders (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE bookings ADD CONSTRAINT fk_bk_ws_res FOREIGN KEY (workspace_id, resource_id) REFERENCES booking_resources (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
` },
  { id: '003_features_and_exports', checksum: 'a4322bfe4d1cfbe78ac4b621415f4ec2110d553f4f9983299b9cb5e54fd5acb1', sql: `-- 003_features_and_exports.sql
-- Rate limiting serverless, pg-bytea StorageAdapter, Export Center (F-17), dan modul P2 (F-13)

-- F-10: Rate limit lintas-instance berbasis SQL atomik (non-tenant)
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON api_rate_limits (reset_at);

-- F-11: StorageAdapter (pg-bytea, maks 3 MB)
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 3145728),
  sha256 TEXT NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by_device_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_ws_entity ON files (workspace_id, entity_type, entity_id);

-- F-17: Export & Activity Center
CREATE TABLE IF NOT EXISTS receipt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size_preset TEXT NOT NULL DEFAULT '80mm',
  is_default BOOLEAN NOT NULL DEFAULT false,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES receipt_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_device_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preset TEXT NOT NULL DEFAULT 'executive',
  is_default BOOLEAN NOT NULL DEFAULT false,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_device_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS export_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'activity_summary')),
  format TEXT NOT NULL CHECK (format IN ('pdf', 'jpg', 'png', 'xlsx', 'csv')),
  template_preset TEXT NOT NULL,
  template_id UUID,
  template_version INTEGER NOT NULL DEFAULT 1,
  source_id UUID,
  report_number TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by_device_id UUID,
  created_by_operator TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_export_records_ws_created ON export_records (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_records_code ON export_records (workspace_id, verification_code);

-- F-13: Penambahan kolom CRM segment/tag & price tier
ALTER TABLE clients ADD COLUMN IF NOT EXISTS segment TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- F-13: Quotation & Sales Order
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id UUID,
  number TEXT NOT NULL,
  client_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  valid_until DATE,
  subtotal BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  tax BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id UUID,
  number TEXT NOT NULL,
  quotation_id UUID,
  client_id UUID,
  status TEXT NOT NULL DEFAULT 'confirmed',
  subtotal BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  tax BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  invoice_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F-13: Stock Transfer & Stock Count (Opname)
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL,
  to_warehouse_id UUID NOT NULL,
  product_id UUID NOT NULL,
  qty_milli BIGINT NOT NULL CHECK (qty_milli > 0),
  status TEXT NOT NULL DEFAULT 'completed',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  warehouse_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F-13: Purchase Request & Supplier Return
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  requester TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_total BIGINT NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  supplier_id UUID,
  po_id UUID,
  total BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F-13: HR Leave, Shift, Payroll
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  shift_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  total_gross BIGINT NOT NULL DEFAULT 0,
  total_deductions BIGINT NOT NULL DEFAULT 0,
  total_net BIGINT NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F-13: Task Comments, Bank Reconciliation, Credit Notes, Import Batches, Privacy DSR
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id UUID NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  statement_date DATE NOT NULL,
  statement_balance BIGINT NOT NULL,
  book_balance BIGINT NOT NULL,
  difference BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reconciled',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  invoice_id UUID,
  client_id UUID,
  amount BIGINT NOT NULL CHECK (amount > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'committed',
  inserted_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'rectification', 'erasure', 'restriction')),
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Berikan hak akses ke bf_app & aktifkan FORCE RLS pada semua tabel baru bertenant
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bf_app;
REVOKE UPDATE, DELETE ON TABLE export_records FROM bf_app;

DO $$
DECLARE
  t text;
  new_tenant_tables text[] := ARRAY[
    'files', 'receipt_templates', 'receipt_template_versions',
    'report_templates', 'report_template_versions', 'export_records',
    'quotations', 'sales_orders', 'stock_transfers', 'stock_counts',
    'purchase_requests', 'supplier_returns', 'leave_requests', 'shifts',
    'payroll_runs', 'task_comments', 'bank_reconciliations', 'credit_notes',
    'import_batches', 'data_subject_requests'
  ];
BEGIN
  FOREACH t IN ARRAY new_tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;
` },
  { id: '004_prd_157_modules', checksum: '358e31a0ee09f012a1f145b2f69d1a9b28593e82ad21ae0b1ef76caed22f7682', sql: `-- 004_prd_157_modules.sql — Tabel pendukung 10 paket kemampuan PRD (157 Fitur)
-- Idempotent & RLS-enabled untuk auto-migrate via ensureSchemaMigrated()

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  device_id uuid,
  operator text,
  opening_cash bigint NOT NULL DEFAULT 0,
  cash_in bigint NOT NULL DEFAULT 0,
  cash_out bigint NOT NULL DEFAULT 0,
  cash_sales bigint NOT NULL DEFAULT 0,
  cash_refunds bigint NOT NULL DEFAULT 0,
  expected_cash bigint NOT NULL DEFAULT 0,
  counted_cash bigint,
  variance bigint,
  status text NOT NULL DEFAULT 'open',
  note text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'available',
  active_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  warehouse_id uuid,
  batch_no text NOT NULL,
  serial_no text,
  qty_milli bigint NOT NULL DEFAULT 0,
  expiry_date date,
  cost_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_waste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  warehouse_id uuid,
  qty_milli bigint NOT NULL DEFAULT 0,
  reason text NOT NULL,
  cost_cents bigint NOT NULL DEFAULT 0,
  operator text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid,
  version int NOT NULL DEFAULT 1,
  name text NOT NULL,
  yield_qty numeric(18,3) NOT NULL DEFAULT 1,
  yield_unit text NOT NULL DEFAULT 'pcs',
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number text NOT NULL,
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  product_id uuid,
  planned_qty numeric(18,3) NOT NULL DEFAULT 1,
  actual_qty numeric(18,3) NOT NULL DEFAULT 0,
  waste_qty numeric(18,3) NOT NULL DEFAULT 0,
  labor_cost_cents bigint NOT NULL DEFAULT 0,
  overhead_cost_cents bigint NOT NULL DEFAULT 0,
  total_cost_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Peralatan',
  location text,
  responsible text,
  acquisition_date date NOT NULL DEFAULT CURRENT_DATE,
  acquisition_cost_cents bigint NOT NULL DEFAULT 0,
  residual_value_cents bigint NOT NULL DEFAULT 0,
  useful_life_months int NOT NULL DEFAULT 36,
  method text NOT NULL DEFAULT 'straight_line',
  accumulated_dep_cents bigint NOT NULL DEFAULT 0,
  book_value_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_depreciation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  book_value_after_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  basis text NOT NULL DEFAULT 'product',
  rate_percent numeric(6,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  standard_cost_cents bigint NOT NULL DEFAULT 0,
  labor_cost_cents bigint NOT NULL DEFAULT 0,
  material_cost_cents bigint NOT NULL DEFAULT 0,
  equipment_cost_cents bigint NOT NULL DEFAULT 0,
  facility_cost_cents bigint NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  wait_minutes int NOT NULL DEFAULT 0,
  process_minutes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operational_displays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ticket_no text NOT NULL,
  station text NOT NULL DEFAULT 'kitchen',
  title text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'cashier_shifts', 'pos_tables', 'product_batches', 'stock_waste',
    'recipes', 'work_orders', 'fixed_assets', 'asset_depreciation_logs',
    'commission_rules', 'service_costs', 'operational_displays'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      tbl
    );
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO bf_app', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
` },
  { id: '005_remediation_hardening', checksum: '32cf351ed32717a6f8d07fcd5fb20072d8c55d197e10f871dcd21a46d6e65343', sql: `-- 005_remediation_hardening.sql
-- Hardening skema untuk BF-010, BF-013, BF-017, BF-035, BF-036, NF-12, NF-14, NF-16

-- 1. Idempotency keys: simpan route, request_hash, response_status, response_body (BF-036)
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS route TEXT NOT NULL DEFAULT '';
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS response_status INTEGER NOT NULL DEFAULT 201;
DROP INDEX IF EXISTS idem_ws_key;
CREATE UNIQUE INDEX IF NOT EXISTS idem_ws_route_key ON idempotency_keys (workspace_id, route, key);

-- 2. Cashier shifts: pastikan hanya 1 shift terbuka per workspace (atau branch) secara atomik (BF-017)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shifts_one_open
  ON cashier_shifts (workspace_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';

-- 3. Fixed asset depreciation: cegah double depreciation pada periode yang sama (BF-010)
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_dep_period
  ON asset_depreciation_logs (workspace_id, asset_id, period_month);

-- 4. Export records / durable artifact metadata (BF-013, BF-035, NF-16)
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS object_key TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS artifact_data BYTEA;

-- 5. Least privilege untuk api_rate_limits (NF-12, NF-14)
DO $$
BEGIN
  IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
    REVOKE ALL ON TABLE api_rate_limits FROM bf_app;
  END IF;
END
$$;

-- 6. RLS fail-closed untuk jobs (NF-04)
DO $$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON jobs;
    CREATE POLICY tenant_isolation ON jobs
      USING (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        OR (workspace_id IS NULL AND NULLIF(current_setting('app.workspace_id', true), '') IS NULL)
      )
      WITH CHECK (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        OR (workspace_id IS NULL AND NULLIF(current_setting('app.workspace_id', true), '') IS NULL)
      );
    BEGIN
      GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO bf_app;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END
$$;

-- 7. Remediasi drift tabel devices (BF-002: default gen_random_uuid pada devices.id)
DO $$
BEGIN
  IF to_regclass('public.devices') IS NOT NULL THEN
    ALTER TABLE devices ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE devices ALTER COLUMN name SET DEFAULT 'Perangkat';
    ALTER TABLE devices ALTER COLUMN failed_attempts SET DEFAULT 0;
    ALTER TABLE devices ALTER COLUMN status SET DEFAULT 'active';
  END IF;
END
$$;


` },
  { id: '006_auth_identity', checksum: '3a250889232159f7f25970eace4d3b405f938b0d927eee185eba67627e10af6d', sql: `-- 006_auth_identity.sql
-- Identitas akun Google (Better Auth), keanggotaan workspace, undangan, audit keamanan.
-- Aditif dan idempoten. Tabel auth bersifat NON-TENANT dan tidak boleh disentuh role aplikasi bf_app.

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email ON "user" (lower(email));

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session (user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires ON session (expires_at);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Kunci identitas = (provider, sub), BUKAN email.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_provider_sub ON account (provider_id, account_id);
CREATE INDEX IF NOT EXISTS idx_account_user ON account (user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification (identifier);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  branch_id UUID,
  warehouse_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members (user_id) WHERE status = 'active';
-- Tepat satu owner aktif per workspace saat ini (transfer owner = fase CP3, dalam satu transaksi).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wm_one_owner ON workspace_members (workspace_id) WHERE role = 'owner' AND status = 'active';

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'staff',
  branch_id UUID,
  warehouse_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  accepted_by TEXT REFERENCES "user"(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_events (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  user_id TEXT,
  type TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_ws ON auth_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events (user_id, created_at DESC);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE onboarding_drafts ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

-- RLS: tabel bertenant baru
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_members','workspace_invitations','auth_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;
-- Pemilik koneksi (service auth) boleh membaca keanggotaan miliknya sendiri lewat app.user_id (tanpa konteks tenant).
DROP POLICY IF EXISTS member_self_read ON workspace_members;
CREATE POLICY member_self_read ON workspace_members FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));

-- Hak akses: role aplikasi TIDAK boleh menyentuh tabel auth; audit & keanggotaan hanya baca/tambah via tenant.
REVOKE ALL ON TABLE "user", session, account, verification FROM bf_app;
GRANT SELECT ON workspace_members TO bf_app;
GRANT SELECT, INSERT ON auth_events TO bf_app;
GRANT SELECT ON workspace_invitations TO bf_app;
` },
  { id: '007_depreciation_journal', checksum: 'fb46eca4f62f587bc4a0f4b329be69f977dc873fc13f2e5b1d76ccb6be15f2d8', sql: `-- 007_depreciation_journal.sql — depresiasi aset mem-post jurnal; koreksi via jurnal balik
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS journal_entry_id uuid;
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS reversal_entry_id uuid;
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
DO $$ BEGIN
  ALTER TABLE asset_depreciation_logs ADD CONSTRAINT adl_status CHECK (status IN ('posted','reversed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- unik hanya untuk yang masih berlaku: periode yang dibalik dapat diposting ulang
DROP INDEX IF EXISTS uq_asset_dep_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_dep_period_posted
  ON asset_depreciation_logs (workspace_id, asset_id, period_month) WHERE status = 'posted';
` },
  { id: '008_payroll_server_side', checksum: 'b40b03c0645b9ac9980298cf8b94b9213985347e2359556d6d79c3309ec120eb', sql: `-- 008_payroll_server_side.sql — payroll dihitung server, bertahap draft → posted (jurnal) → reversed
ALTER TABLE payroll_runs ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS journal_entry_id uuid;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS reversal_entry_id uuid;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS created_by text;
DO $$ BEGIN
  ALTER TABLE payroll_runs ADD CONSTRAINT payroll_status CHECK (status IN ('draft','posted','reversed','cancelled','legacy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- run lama (diisi manual dari klien) ditandai legacy agar tidak dianggap hasil hitung server
UPDATE payroll_runs SET status = 'legacy' WHERE status = 'posted' AND journal_entry_id IS NULL AND posted_at IS NULL;
-- satu run aktif per periode (draft/posted); aman bila data lama bentrok
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_period_active ON payroll_runs (workspace_id, period_month) WHERE status IN ('draft','posted');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'uq_payroll_period_active dilewati: %', SQLERRM; END $$;
` },
  { id: '009_export_lifecycle', checksum: '95d69afa6c9d350d277205f35b68325440dd2c677c1e9b52feae75bbf562fcf1', sql: `-- 009_export_lifecycle.sql — status ekspor nyata: pending → completed | failed (dikonfirmasi setelah file benar-benar dibuat)
ALTER TABLE export_records ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE export_records ADD CONSTRAINT export_status CHECK (status IN ('pending','completed','failed','preview','reversed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Role aplikasi hanya boleh mengubah kolom status siklus hidup (snapshot/riwayat tetap immutable).
GRANT UPDATE (status, error, completed_at) ON export_records TO bf_app;
` },
  { id: '010_auth_rate_limits', checksum: '31e729c2786c51ddfedc0ad301bed1a97703a1126f1cc0ff4213a3ac4c1ddf1f', sql: `-- 010_auth_rate_limits.sql — rate limit login/callback lintas instance (non-tenant, bukan untuk bf_app)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  last_request BIGINT NOT NULL
);
REVOKE ALL ON TABLE auth_rate_limits FROM bf_app;
` },
  { id: '011_fallback_resilience', checksum: 'a2858513dfc2266e3699b003f218f0f46bb94ba935136b7b71025a161607f50d', sql: `-- 011_fallback_resilience.sql
-- Fondasi sistem FALLBACK (tanpa ENV baru).
-- Semua tabel di sini NON-TENANT dan HANYA diakses role pemilik (server).
-- Tidak ada kolom workspace_id (sengaja) sehingga tidak masuk inventaris RLS bertenant;
-- rujukan workspace memakai kolom workspace_ref tanpa foreign key.
-- Tabel-tabel ini TIDAK diberikan akses ke role aplikasi bf_app (defense in depth).

-- Secret aplikasi hasil pembangkitan (F-02). Nilai tidak pernah dikirim ke klien/log.
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE app_secrets FROM bf_app;

-- Saklar sistem (F-01/F-15). Baris fallbacks_enabled default true.
CREATE TABLE IF NOT EXISTS system_flags (
  key TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_flags (key, value) VALUES ('fallbacks_enabled', TRUE)
  ON CONFLICT (key) DO NOTHING;
REVOKE ALL ON TABLE system_flags FROM bf_app;

-- Catatan aktivasi fallback (F-16). Tanpa PII/secret.
CREATE TABLE IF NOT EXISTS fallback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_ref UUID,
  fallback_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_fallback_events_created ON fallback_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fallback_events_fallback ON fallback_events (fallback_id, created_at DESC);
REVOKE ALL ON TABLE fallback_events FROM bf_app;

-- Sesi darurat perangkat (F-06 / 4.5.2). Hash token, maksimum 8 jam, tidak dapat diperpanjang.
CREATE TABLE IF NOT EXISTS emergency_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  device_id UUID NOT NULL,
  workspace_ref UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_emergency_sessions_device ON emergency_sessions (device_id, created_at DESC);
REVOKE ALL ON TABLE emergency_sessions FROM bf_app;

-- Metadata auth workspace (4.5.1). Default google supaya perilaku lama tidak berubah.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'google';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS emergency_login_enabled BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN
  ALTER TABLE workspaces ADD CONSTRAINT workspaces_auth_mode_check CHECK (auth_mode IN ('google','device'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sinkronisasi onboarding draft lintas perangkat: ikat ke user_id (bukan hanya device).
ALTER TABLE onboarding_drafts ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_onboarding_drafts_user ON onboarding_drafts (user_id) WHERE user_id IS NOT NULL;

-- Tandai audit yang berasal dari sesi darurat (4.5.2).
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS via_emergency BOOLEAN NOT NULL DEFAULT FALSE;
` },
  { id: '012_pairing_claim_context', checksum: '7f36c4ae50a713e21f34f0aa12158ec5f08e690028d002c73d52b28bde459066', sql: `-- 012_pairing_claim_context.sql
-- Klaim kode pairing berjalan TANPA sesi dan TANPA konteks tenant (POST /api/v1/device/pair),
-- sementara pairing_codes memakai ENABLE + FORCE ROW LEVEL SECURITY. Akibatnya klaim selalu
-- gagal: UPDATE tidak mengenai baris apa pun (0 rows) sehingga kode valid ditolak selamanya.
--
-- Perbaikan tanpa melemahkan isolasi: policy tambahan (permissive, di-OR dengan tenant_isolation)
-- yang hanya membuka SATU baris dengan hash kode yang dipegang pemanggil. Hash 8 karakter acak
-- bersifat rahasia, sekali pakai, berumur 10 menit, dan laju pembuatan/penebusan sudah dibatasi.

DROP POLICY IF EXISTS pairing_claim_select ON pairing_codes;
CREATE POLICY pairing_claim_select ON pairing_codes FOR SELECT
  USING (
    code_hash = NULLIF(current_setting('app.pairing_code', true), '')
    AND used_at IS NULL
  );

DROP POLICY IF EXISTS pairing_claim_update ON pairing_codes;
CREATE POLICY pairing_claim_update ON pairing_codes FOR UPDATE
  USING (
    code_hash = NULLIF(current_setting('app.pairing_code', true), '')
    AND used_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (code_hash = NULLIF(current_setting('app.pairing_code', true), ''));
` },
  { id: '013_v6_business_flow', checksum: 'b0a7f09e47c9e79faf777b37b0eb4bcfe2d28560821a8d200b88c8694677d152', sql: `-- 013_v6_business_flow.sql
-- Business Flow v6.0 — aditif & idempoten.
--   1) Marketplace multi-kanal (channel, listing, order, settlement)
--   2) Ruang data pribadi (owner-scoped RLS, TERPISAH dari workspace/bisnis — R4)
--   3) Jembatan pemilik ↔ bisnis (pemetaan eksplisit + catatan posting)
--   4) Etalase publik + permintaan masuk
--   5) RFQ (permintaan penawaran) + kutipan
--   6) Progres pembelajaran
-- Uang = NUMERIC(18,2); kuantitas = NUMERIC(18,3). Tidak ada kolom float.

/* ───────────── Marketplace ───────────── */
CREATE TABLE IF NOT EXISTS marketplace_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'manual', -- shopee | tokopedia | tiktok | manual
  fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_channels_fee CHECK (fee_percent >= 0 AND fee_percent <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_channels_ws_name ON marketplace_channels(workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_sku text,
  price numeric(18,2) NOT NULL DEFAULT 0,
  stock_buffer numeric(18,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', -- active | paused | ended
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_listings_price CHECK (price >= 0),
  CONSTRAINT marketplace_listings_buffer CHECK (stock_buffer >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_channel_sku
  ON marketplace_listings(workspace_id, channel_id, coalesce(external_sku, ''));

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  occurred_on date NOT NULL,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount numeric(18,2) NOT NULL DEFAULT 0,
  platform_fee numeric(18,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(18,2) NOT NULL DEFAULT 0,
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid', -- pending | paid | shipped | settled | cancelled
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_orders_amounts CHECK (
    gross_amount >= 0 AND discount >= 0 AND platform_fee >= 0 AND shipping_cost >= 0 AND net_amount >= 0
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_channel_no ON marketplace_orders(workspace_id, channel_id, order_no);
CREATE INDEX IF NOT EXISTS marketplace_orders_ws_date ON marketplace_orders(workspace_id, occurred_on);

CREATE TABLE IF NOT EXISTS marketplace_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  fee_amount numeric(18,2) NOT NULL DEFAULT 0,
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'recorded', -- recorded | received
  received_on date,
  journal_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_settlements_amounts CHECK (gross_amount >= 0 AND fee_amount >= 0 AND net_amount >= 0),
  CONSTRAINT marketplace_settlements_period CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS marketplace_settlements_ws ON marketplace_settlements(workspace_id, period_end);

/* ───────────── Ruang pribadi (owner-scoped; TIDAK memakai workspace_id) ───────────── */
CREATE TABLE IF NOT EXISTS personal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cash', -- cash | bank | ewallet | other
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_accounts_owner_name ON personal_accounts(owner_id, lower(name));

CREATE TABLE IF NOT EXISTS personal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES personal_accounts(id) ON DELETE CASCADE,
  to_account_id uuid REFERENCES personal_accounts(id) ON DELETE SET NULL,
  type text NOT NULL, -- income | expense | transfer
  amount numeric(18,2) NOT NULL,
  category text,
  occurred_on date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_transactions_amount CHECK (amount > 0),
  CONSTRAINT personal_transactions_transfer CHECK (type <> 'transfer' OR (to_account_id IS NOT NULL AND to_account_id <> account_id))
);
CREATE INDEX IF NOT EXISTS personal_transactions_owner_date ON personal_transactions(owner_id, occurred_on);

CREATE TABLE IF NOT EXISTS personal_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  month text NOT NULL, -- YYYY-MM
  category text NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_budgets_amount CHECK (amount >= 0),
  CONSTRAINT personal_budgets_month CHECK (month ~ '^\\d{4}-\\d{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_budgets_owner_month_cat ON personal_budgets(owner_id, month, category);

CREATE TABLE IF NOT EXISTS personal_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name text NOT NULL,
  target_amount numeric(18,2) NOT NULL,
  saved_amount numeric(18,2) NOT NULL DEFAULT 0,
  target_date date,
  status text NOT NULL DEFAULT 'active', -- active | achieved | cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_goals_amount CHECK (target_amount > 0 AND saved_amount >= 0)
);

/* ───────────── Jembatan pemilik ↔ bisnis ───────────── */
CREATE TABLE IF NOT EXISTS bridge_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  label text NOT NULL,
  direction text NOT NULL, -- personal_to_business | business_to_owner
  personal_category text,
  cash_account_id uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  coa_account_id uuid NOT NULL REFERENCES coa_accounts(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bridge_mappings_owner_label ON bridge_mappings(workspace_id, owner_id, lower(label));

CREATE TABLE IF NOT EXISTS bridge_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  mapping_id uuid NOT NULL REFERENCES bridge_mappings(id) ON DELETE CASCADE,
  personal_transaction_id uuid REFERENCES personal_transactions(id) ON DELETE SET NULL,
  finance_transaction_id uuid,
  amount numeric(18,2) NOT NULL,
  posted_on date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_postings_amount CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS bridge_postings_ws ON bridge_postings(workspace_id, posted_on);

/* ───────────── Etalase publik ───────────── */
CREATE TABLE IF NOT EXISTS storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  tagline text,
  about text,
  contact_phone text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_slug ON storefronts(lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_ws ON storefronts(workspace_id);

CREATE TABLE IF NOT EXISTS storefront_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  storefront_id uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  contact text NOT NULL,
  message text,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity numeric(18,3),
  status text NOT NULL DEFAULT 'new', -- new | handled
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storefront_inquiries_ws ON storefront_inquiries(workspace_id, created_at);

/* ───────────── RFQ (permintaan penawaran) ───────────── */
CREATE TABLE IF NOT EXISTS rfq_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  number text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  due_date date,
  status text NOT NULL DEFAULT 'open', -- open | quoted | accepted | closed | cancelled
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rfq_requests_ws_number ON rfq_requests(workspace_id, number);

CREATE TABLE IF NOT EXISTS rfq_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES rfq_requests(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL,
  valid_until date,
  note text,
  status text NOT NULL DEFAULT 'sent', -- sent | accepted | rejected
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfq_quotes_amount CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS rfq_quotes_rfq ON rfq_quotes(rfq_id);

/* ───────────── Pembelajaran ───────────── */
CREATE TABLE IF NOT EXISTS learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_ref text NOT NULL,
  lesson_key text NOT NULL,
  status text NOT NULL DEFAULT 'started', -- started | completed
  score integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_progress_unique ON learning_progress(workspace_id, user_ref, lesson_key);

/* ───────────── RLS: tabel bertenant (ENABLE + FORCE + policy workspace) ───────────── */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'marketplace_channels', 'marketplace_listings', 'marketplace_orders', 'marketplace_settlements',
    'bridge_mappings', 'bridge_postings', 'storefronts', 'storefront_inquiries',
    'rfq_requests', 'rfq_quotes', 'learning_progress'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

/* Ruang pribadi: isolasi per pemilik (bukan per workspace). Fail-closed bila app.owner_id kosong. */
DO $$
DECLARE
  t text;
  owner_tables text[] := ARRAY['personal_accounts', 'personal_transactions', 'personal_budgets', 'personal_goals'];
BEGIN
  FOREACH t IN ARRAY owner_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY owner_isolation ON %I USING (owner_id = NULLIF(current_setting(''app.owner_id'', true), '''')) WITH CHECK (owner_id = NULLIF(current_setting(''app.owner_id'', true), ''''))',
      t
    );
  END LOOP;
END
$$;

/* Kunci unik komposit (workspace_id, id) untuk FK tenant-aware. */
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_channels_ws_id ON marketplace_channels(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS rfq_requests_ws_id ON rfq_requests(workspace_id, id);

/* FK komposit tenant-aware untuk tabel baru yang mereferensikan entitas bertenant. */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_listings_channel_fk') THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT marketplace_listings_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_orders_channel_fk') THEN
    ALTER TABLE marketplace_orders
      ADD CONSTRAINT marketplace_orders_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rfq_quotes_rfq_fk') THEN
    ALTER TABLE rfq_quotes
      ADD CONSTRAINT rfq_quotes_rfq_fk
      FOREIGN KEY (workspace_id, rfq_id) REFERENCES rfq_requests(workspace_id, id) ON DELETE CASCADE;
  END IF;
END
$$;

/* Hak akses role aplikasi. Personal space tetap dapat diakses bf_app, tetapi RLS pemilik yang menentukan. */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  marketplace_channels, marketplace_listings, marketplace_orders, marketplace_settlements,
  personal_accounts, personal_transactions, personal_budgets, personal_goals,
  bridge_mappings, bridge_postings, storefronts, storefront_inquiries,
  rfq_requests, rfq_quotes, learning_progress
TO bf_app;

/* Catatan append-only: posting jembatan tidak boleh diubah/dihapus setelah tercatat. */
REVOKE UPDATE, DELETE ON TABLE bridge_postings FROM bf_app;
` },
  { id: '014_user_locale', checksum: '519e4fc0d7e0f3792ae8622fcb202c787d7023267869f6c0a79785d3ee483559', sql: `-- 014_user_locale: preferensi bahasa per pengguna (lintas perangkat), bukan localStorage.
-- Additif + idempoten. Bahasa workspace tetap menjadi cadangan.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS locale text;
` },
  { id: '015_personal_dual_rls', checksum: 'ab31c30105cc5772d3a10296c3b61255cf81f9103f4faace82cac6d5ae348bea', sql: `-- 015_personal_dual_rls: RLS dua lapis untuk ruang pribadi.
-- Lapis 1: baris milik pemilik (app.owner_id).
-- Lapis 2: pemilik tersebut benar-benar berperan owner aktif pada workspace konteks (app.workspace_id).
-- Tanpa kedua setting (konteks kosong) → tidak ada baris yang lolos (gagal tertutup).
-- Additif + idempoten: mengganti policy lama dengan nama baru.

DROP POLICY IF EXISTS owner_isolation ON personal_accounts;
DROP POLICY IF EXISTS personal_dual_scope ON personal_accounts;
CREATE POLICY personal_dual_scope ON personal_accounts FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS owner_isolation ON personal_transactions;
DROP POLICY IF EXISTS personal_dual_scope ON personal_transactions;
CREATE POLICY personal_dual_scope ON personal_transactions FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS owner_isolation ON personal_budgets;
DROP POLICY IF EXISTS personal_dual_scope ON personal_budgets;
CREATE POLICY personal_dual_scope ON personal_budgets FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS owner_isolation ON personal_goals;
DROP POLICY IF EXISTS personal_dual_scope ON personal_goals;
CREATE POLICY personal_dual_scope ON personal_goals FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );
` },
  { id: '016_marketplace_credentials', checksum: 'cd07fe75bec6d163e3c87c388e2d6df1ff277db6f39447e022aecd66cdb98893', sql: `-- 016_marketplace_credentials: kredensial API kanal marketplace.
-- Disimpan terenkripsi (AES-256-GCM) di server; hanya hint 4 karakter terakhir yang
-- boleh dibaca kembali lewat API. Tidak ada kredensial yang dikembalikan sebagai plaintext.
-- Additif + idempoten.

ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS credential_enc TEXT;
ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS credential_hint TEXT;
ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS credential_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN marketplace_channels.credential_enc IS 'Ciphertext AES-256-GCM (iv.tag.data, base64) — jangan pernah diekspos ke klien';
COMMENT ON COLUMN marketplace_channels.credential_hint IS 'Empat karakter terakhir untuk ditampilkan di UI';
` },
  { id: '017_nopay_record_only', checksum: '8119e97ba8c9775bd64763755dbbe881592fd3f5de3d0cd671020c1fad8101d1', sql: `-- 017_nopay_record_only: menegakkan aturan PENCATATAN MURNI (prompt R7-C §1).
--
-- Aplikasi tidak menyimpan kunci/token pihak ketiga dan tidak menyambung ke API
-- marketplace/bank (larangan L1–L7). Dua hal yang dibuat oleh versi sebelumnya
-- sekarang dimatikan:
--   1. kolom kredensial kanal (dibuat migrasi 016) — dihapus;
--   2. tabel storefront_inquiries (dibuat migrasi 013) — etalase menjadi katalog
--      informasi baca-saja tanpa kotak masuk permintaan pembeli (revisi F-08).
--
-- Additif + idempoten; migrasi lama tidak diubah (checksum terjaga).

ALTER TABLE marketplace_channels
  DROP COLUMN IF EXISTS credential_enc,
  DROP COLUMN IF EXISTS credential_hint,
  DROP COLUMN IF EXISTS credential_updated_at;

DROP TABLE IF EXISTS storefront_inquiries;

-- Nilai jenis akun kas "ewallet" tidak lagi dipakai (kosakata terkunci: dompet/wallet).
UPDATE cash_accounts SET kind = 'digital' WHERE kind = 'ewallet';

COMMENT ON TABLE marketplace_channels IS 'Label kanal penjualan untuk data tercatat; tanpa kredensial, tanpa penyambungan, tanpa transaksi.';
` },
  { id: '018_import_recording', checksum: 'a44ee4f311de5e92095748ff5288d8679bd2b1a77d2d96743d56aa8c132928e7', sql: `-- 018_import_recording: pencatatan hasil impor berkas (prompt R7-C §4).
--
-- Semua tabel di sini adalah CATATAN atas fakta yang sudah terjadi di luar aplikasi:
-- pesanan marketplace, rincian settlement, pencairan tercatat, retur tercatat, dan
-- mutasi rekening bank. Tidak ada tabel dana, tidak ada kredensial, tidak ada
-- instruksi transaksi (prompt R7-C §1).
--
-- Additif + idempoten. Nomor migrasi melanjutkan setelah 017 (tidak menimpa apa pun).

/* ── Provenance pada batch impor yang sudah ada ── */
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS template TEXT,
  ADD COLUMN IF NOT EXISTS template_version TEXT,
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID;

CREATE INDEX IF NOT EXISTS import_batches_ws_created ON import_batches(workspace_id, created_at DESC);
-- Indeks file_hash NON-unik: berkas yang sama boleh diimpor ulang (mis. setelah
-- rentang diperbaiki), dan dedup terjadi di tingkat baris lewat \`source_key\`.
CREATE INDEX IF NOT EXISTS import_batches_ws_hash ON import_batches(workspace_id, file_hash)
  WHERE file_hash IS NOT NULL;

/* ── Baris per-baris hasil impor (galat berstruktur code+params) ── */
CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | inserted | duplicate | invalid
  code TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_key TEXT,
  target_table TEXT,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_rows_batch ON import_rows(batch_id, row_no);
CREATE INDEX IF NOT EXISTS import_rows_key ON import_rows(workspace_id, source_key);

/* ── Provenance pada pesanan marketplace yang sudah ada ── */
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS source_template TEXT,
  ADD COLUMN IF NOT EXISTS source_row INTEGER,
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS external_order_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_source_key
  ON marketplace_orders(workspace_id, source_key) WHERE source_key IS NOT NULL;

/* ── Rincian settlement per pesanan/penyesuaian (dari berkas marketplace) ── */
CREATE TABLE IF NOT EXISTS marketplace_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  statement_id TEXT,
  external_payment_ref TEXT,
  entry_type TEXT NOT NULL DEFAULT 'order', -- order | adjustment
  order_or_adjustment_id TEXT,
  related_order_ref TEXT,
  sku TEXT,
  currency TEXT,
  statement_on DATE,
  net_sales BIGINT,
  shipping BIGINT,
  fees BIGINT,
  adjustment BIGINT,
  total_settlement BIGINT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_settlement_lines_key
  ON marketplace_settlement_lines(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_settlement_lines_ws_date
  ON marketplace_settlement_lines(workspace_id, statement_on DESC);

/* ── Pencairan TERCATAT (dana sudah masuk; aplikasi tidak mencairkan apa pun) ── */
CREATE TABLE IF NOT EXISTS marketplace_cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES marketplace_channels(id) ON DELETE SET NULL,
  external_payment_ref TEXT,
  amount BIGINT NOT NULL,
  currency TEXT,
  recorded_status TEXT NOT NULL DEFAULT 'recorded', -- recorded | reconciled
  occurred_on DATE,
  cash_account_id uuid,
  note TEXT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_cash_receipts_key
  ON marketplace_cash_receipts(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_cash_receipts_ws_date
  ON marketplace_cash_receipts(workspace_id, occurred_on DESC);

/* ── Retur/refund TERCATAT (diputuskan & diselesaikan di luar aplikasi) ── */
CREATE TABLE IF NOT EXISTS marketplace_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES marketplace_channels(id) ON DELETE SET NULL,
  order_ref TEXT,
  return_ref TEXT,
  amount BIGINT,
  currency TEXT,
  occurred_on DATE,
  note TEXT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_returns_key
  ON marketplace_returns(workspace_id, source_key) WHERE source_key IS NOT NULL;

/* ── Mutasi bank hasil impor berkas (bukan pendapatan/biaya otomatis) ── */
CREATE TABLE IF NOT EXISTS bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cash_account_id uuid,
  bank TEXT NOT NULL,
  account_last4 TEXT CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),
  period_start DATE,
  period_end DATE,
  opening_balance BIGINT,
  closing_balance BIGINT,
  file_hash TEXT,
  template TEXT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_statements_ws_period ON bank_statements(workspace_id, period_end DESC);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  posted_on DATE,
  description TEXT NOT NULL DEFAULT '',
  branch TEXT,
  amount BIGINT,
  balance BIGINT,
  direction TEXT, -- debit | credit | null (tidak dipaksakan)
  suggestion TEXT, -- saran klasifikasi; WAJIB dikonfirmasi pengguna
  suggestion_confirmed BOOLEAN NOT NULL DEFAULT false,
  source_row INTEGER,
  seq INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_key
  ON bank_statement_lines(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_statement_lines_ws_date ON bank_statement_lines(workspace_id, posted_on DESC);

/* ── Pencocokan (order ↔ settlement ↔ pencairan ↔ baris bank) ── */
CREATE TABLE IF NOT EXISTS marketplace_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  settlement_line_id uuid REFERENCES marketplace_settlement_lines(id) ON DELETE CASCADE,
  cash_receipt_id uuid REFERENCES marketplace_cash_receipts(id) ON DELETE CASCADE,
  bank_line_id uuid REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unmatched', -- matched | difference | unmatched | incomplete
  difference BIGINT,
  score INTEGER,
  reason TEXT,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_reconciliations_ws_status ON marketplace_reconciliations(workspace_id, status);

/* ── RLS: semua tabel baru bertenant (ENABLE + FORCE + policy workspace) ── */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'import_rows', 'marketplace_settlement_lines', 'marketplace_cash_receipts', 'marketplace_returns',
    'bank_statements', 'bank_statement_lines', 'marketplace_reconciliations'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

/* ── Kunci unik komposit (workspace_id, id) + FK tenant-aware ── */
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_ws_id ON import_batches(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_ws_id ON marketplace_orders(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_settlement_lines_ws_id ON marketplace_settlement_lines(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_cash_receipts_ws_id ON marketplace_cash_receipts(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_ws_id ON bank_statement_lines(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statements_ws_id ON bank_statements(workspace_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_rows_batch_fk') THEN
    ALTER TABLE import_rows ADD CONSTRAINT import_rows_batch_fk
      FOREIGN KEY (workspace_id, batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_lines_channel_fk') THEN
    ALTER TABLE marketplace_settlement_lines ADD CONSTRAINT mkt_settlement_lines_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_statement_fk') THEN
    ALTER TABLE bank_statement_lines ADD CONSTRAINT bank_statement_lines_statement_fk
      FOREIGN KEY (workspace_id, statement_id) REFERENCES bank_statements(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_orders_batch_fk') THEN
    ALTER TABLE marketplace_orders ADD CONSTRAINT mkt_orders_batch_fk
      FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE SET NULL;
  END IF;
END
$$;

/* ── Hak akses untuk peran aplikasi (pola sama seperti migrasi 002/003) ── */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  import_rows, marketplace_settlement_lines, marketplace_cash_receipts, marketplace_returns,
  bank_statements, bank_statement_lines, marketplace_reconciliations
TO bf_app;

COMMENT ON TABLE marketplace_cash_receipts IS 'Pencairan TERCATAT dari marketplace (dana sudah masuk di luar aplikasi); aplikasi tidak mencairkan dana.';
COMMENT ON TABLE marketplace_returns IS 'Retur/refund TERCATAT yang diputuskan dan diselesaikan di luar aplikasi.';
COMMENT ON TABLE bank_statement_lines IS 'Catatan mutasi rekening hasil impor berkas; bukan pendapatan/biaya otomatis dan menunggu konfirmasi pengguna.';
` },
  { id: '019_import_mapping_profiles', checksum: 'acc8920430f10fa5efdf8609b5900c22b08914909c736bf163653bea5bc2fad2', sql: `-- 019_import_mapping_profiles: Mapping Profiles berversi + provenance impor generik (R11-A).
--
-- ADDITIF saja. Tidak ada DROP di sini (pencabutan kolom sidik jari ada di migrasi
-- terpisah 020 yang dijalankan hanya setelah jalur baru hijau).
--
-- Profil = pemetaan kolom yang DIKONFIRMASI pengguna, per workspace. Versi immutable:
-- perubahan menghasilkan baris versi baru, dan batch merekam versi yang dipakai.

/* ── Kolom provenance pada batch impor ── */
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS provider_code TEXT,
  ADD COLUMN IF NOT EXISTS report_type TEXT,
  ADD COLUMN IF NOT EXISTS row_grain TEXT,
  ADD COLUMN IF NOT EXISTS source_label_id uuid,
  ADD COLUMN IF NOT EXISTS mapping_profile_id uuid,
  ADD COLUMN IF NOT EXISTS mapping_profile_version INTEGER,
  ADD COLUMN IF NOT EXISTS user_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sheet_name TEXT,
  ADD COLUMN IF NOT EXISTS header_row INTEGER;

CREATE INDEX IF NOT EXISTS import_batches_ws_report ON import_batches(workspace_id, report_type, created_at DESC);

/* ── Profil pemetaan (kepala) ── */
CREATE TABLE IF NOT EXISTS import_mapping_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,               -- marketplace | bank
  report_type TEXT NOT NULL,
  provider_code TEXT,                 -- konteks sumber; boleh kosong
  source_label TEXT,                  -- toko/alias rekening (teks label, tanpa kredensial)
  file_format TEXT NOT NULL DEFAULT 'any', -- csv | xlsx | any
  status TEXT NOT NULL DEFAULT 'USER_CONFIRMED', -- DRAFT | USER_CONFIRMED | NEEDS_UPDATE | DISABLED
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profiles_ws_name
  ON import_mapping_profiles(workspace_id, lower(name)) WHERE status <> 'DISABLED';
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profiles_ws_id
  ON import_mapping_profiles(workspace_id, id);

/* ── Versi profil (IMMUTABLE: tidak pernah diubah di tempat) ── */
CREATE TABLE IF NOT EXISTS import_mapping_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  version INTEGER NOT NULL,
  sheet_name TEXT,
  header_row INTEGER NOT NULL DEFAULT 0,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,   -- field kanonik → nama header sumber
  parsing JSONB NOT NULL DEFAULT '{}'::jsonb,   -- opsi parsing yang dikonfirmasi pengguna
  created_by UUID,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profile_versions_unique
  ON import_mapping_profile_versions(workspace_id, profile_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profile_versions_ws_id
  ON import_mapping_profile_versions(workspace_id, id);
CREATE INDEX IF NOT EXISTS import_mapping_profile_versions_profile
  ON import_mapping_profile_versions(workspace_id, profile_id, version DESC);

/* ── RLS: ENABLE + FORCE + policy workspace (pola migrasi 002/018) ── */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['import_mapping_profiles', 'import_mapping_profile_versions'];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

/* ── FK komposit tenant-aware + FK batch → profil ── */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_mapping_profile_versions_profile_fk') THEN
    ALTER TABLE import_mapping_profile_versions ADD CONSTRAINT import_mapping_profile_versions_profile_fk
      FOREIGN KEY (workspace_id, profile_id) REFERENCES import_mapping_profiles(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_batches_mapping_profile_fk') THEN
    ALTER TABLE import_batches ADD CONSTRAINT import_batches_mapping_profile_fk
      FOREIGN KEY (workspace_id, mapping_profile_id) REFERENCES import_mapping_profiles(workspace_id, id) ON DELETE SET NULL;
  END IF;
END
$$;

/* ── Hak akses peran aplikasi (bug R7-C: tabel baru tanpa GRANT) ── */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_mapping_profiles, import_mapping_profile_versions TO bf_app;

COMMENT ON TABLE import_mapping_profiles IS 'Profil pemetaan kolom per workspace: dibuat dari pemetaan yang dikonfirmasi pengguna, berversi immutable, TIDAK memakai sidik jari.';
COMMENT ON TABLE import_mapping_profile_versions IS 'Versi immutable pemetaan (sheet, baris header, mapping, opsi parsing). Batch merekam versi yang dipakai.';
` },
  { id: '020_drop_import_file_digest', checksum: '90cb1cb9159d706907291b2d8e3f6d28fd70046f954a2b097f3399c068f06051', sql: `-- 020_drop_import_fingerprint: pencabutan kolom & indeks sidik jari berkas (R11-A langkah 5).
--
-- Dijalankan HANYA setelah jalur impor generik hijau: kode tidak lagi membaca atau
-- menulis kolom-kolom ini, jadi menghapusnya tidak menghilangkan apa pun yang dipakai.
-- Nama kolom sengaja hanya muncul pada pernyataan DROP (dijaga gerbang G-NOFP).
--
-- Idempoten: setiap pernyataan memakai IF EXISTS.

/* import_batches: hash berkas tidak lagi disimpan (dedupe memakai kunci alami baris) */
DROP INDEX IF EXISTS import_batches_ws_hash;
ALTER TABLE import_batches
  DROP COLUMN IF EXISTS file_hash;

/* bank_statements: hash berkas tidak lagi disimpan */
ALTER TABLE bank_statements
  DROP COLUMN IF EXISTS file_hash;

COMMENT ON COLUMN import_batches.filename IS 'Nama berkas sumber (metadata provenance), BUKAN kunci dedupe.';
` },
  { id: '021_marketplace_bank_settlement', checksum: '8250ee902a0638faa2f9f2b812b624e6a06735fa9991c58cec688f5085fe4640', sql: `-- 021_marketplace_bank_settlement: model data pencatatan marketplace, settlement,
-- rekening bank, pemetaan SKU, dan rekonsiliasi (prompt R13 bagian 3.1 / R10-T3).
--
-- Sifat: CATATAN atas fakta yang sudah terjadi di luar aplikasi. Tidak ada tabel dana,
-- tidak ada kredensial, tidak ada instruksi pembayaran/transfer/refund, tidak ada
-- kolom hash berkas (G-NOFP). Nominal uang = BIGINT unit minor (bilangan bulat),
-- tanpa float. Semua tabel bertenant: RLS ENABLE+FORCE + GRANT eksplisit ke bf_app.
--
-- Additif dan idempoten; melanjutkan nomor setelah 020.

/* Rincian item pesanan marketplace (target impor \`orders_items\`) */
CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  order_id uuid,
  external_order_ref text NOT NULL,
  external_item_ref text,
  seller_sku text,
  platform_sku text,
  product_name_raw text,
  variant_raw text,
  quantity BIGINT,
  unit_price BIGINT,
  gross_line_amount BIGINT,
  seller_discount_amount BIGINT,
  platform_discount_amount BIGINT,
  currency text,
  order_on date,
  identify_note text,
  import_batch_id uuid,
  source_row integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_items_source_key
  ON marketplace_order_items(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_order_items_ws_order
  ON marketplace_order_items(workspace_id, external_order_ref);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_items_ws_id
  ON marketplace_order_items(workspace_id, id);

/* Ringkasan statement settlement (target impor \`settlement_summary\`) */
CREATE TABLE IF NOT EXISTS marketplace_settlement_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  statement_reference text,
  statement_on date,
  period_start date,
  period_end date,
  currency text,
  gross_or_net_total BIGINT,
  fee_total BIGINT,
  adjustment_total BIGINT,
  settlement_total BIGINT NOT NULL,
  reserve_or_hold_amount BIGINT,
  reconciliation_level text NOT NULL DEFAULT 'summary_only',
  note text,
  import_batch_id uuid,
  source_row integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_settlement_summaries_source_key
  ON marketplace_settlement_summaries(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_settlement_summaries_ws_date
  ON marketplace_settlement_summaries(workspace_id, statement_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_settlement_summaries_ws_id
  ON marketplace_settlement_summaries(workspace_id, id);

/* Referensi pembayaran eksternal (teks rujukan, BUKAN instruksi pembayaran apa pun) */
CREATE TABLE IF NOT EXISTS marketplace_external_payment_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid,
  external_payment_ref text NOT NULL,
  statement_reference text,
  amount BIGINT,
  currency text,
  referenced_on date,
  settlement_summary_id uuid,
  settlement_line_id uuid,
  import_batch_id uuid,
  source_row integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_ext_payment_refs_source_key
  ON marketplace_external_payment_references(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_ext_payment_refs_ws_ref
  ON marketplace_external_payment_references(workspace_id, external_payment_ref);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_ext_payment_refs_ws_id
  ON marketplace_external_payment_references(workspace_id, id);

/* Pemetaan SKU eksternal -> produk internal (per workspace + kanal). TIDAK mengubah
   stok/HPP dan tidak menyinkronkan apa pun ke marketplace. */
CREATE TABLE IF NOT EXISTS marketplace_sku_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  external_sku text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_sku_mappings_key
  ON marketplace_sku_mappings(workspace_id, channel_id, lower(external_sku));
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_sku_mappings_ws_id
  ON marketplace_sku_mappings(workspace_id, id);

/* Alias rekening bank: label + maksimal 4 digit terakhir. Tanpa nomor penuh,
   tanpa kredensial, tanpa akses bank. */
CREATE TABLE IF NOT EXISTS bank_account_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label text NOT NULL,
  bank_label text,
  account_last4 text CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),
  cash_account_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_account_aliases_label
  ON bank_account_aliases(workspace_id, lower(label));
CREATE UNIQUE INDEX IF NOT EXISTS bank_account_aliases_ws_id
  ON bank_account_aliases(workspace_id, id);

/* Baris mutasi bank: kolom tambahan (tanggal terpisah, alias, klasifikasi terkonfirmasi). */
ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS bank_alias_id uuid,
  ADD COLUMN IF NOT EXISTS transaction_on date,
  ADD COLUMN IF NOT EXISTS value_on date,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS external_transaction_ref text,
  ADD COLUMN IF NOT EXISTS suggested_class text,
  ADD COLUMN IF NOT EXISTS confirmed_class text,
  ADD COLUMN IF NOT EXISTS classified_by uuid,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;
CREATE INDEX IF NOT EXISTS bank_statement_lines_ws_alias
  ON bank_statement_lines(workspace_id, bank_alias_id, posted_on DESC);

/* Statement bank: kaitkan ke alias rekening terdaftar (tanpa nomor penuh) */
ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS bank_alias_id uuid;

/* Pencocokan rekonsiliasi: mendukung 1-1, 1-N, N-1, dan parsial. Keputusan SELALU
   dari pengguna (confirmed_by/at); pelepasan menyimpan unmatched_by/at. */
CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  left_kind text NOT NULL,
  left_id uuid NOT NULL,
  right_kind text NOT NULL DEFAULT 'bank_line',
  right_id uuid NOT NULL,
  match_type text NOT NULL DEFAULT 'one_to_one',
  status text NOT NULL DEFAULT 'manual_review',
  matched_amount BIGINT,
  currency text,
  difference BIGINT,
  score integer,
  reason text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  unmatched_by uuid,
  unmatched_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_active
  ON bank_reconciliation_matches(workspace_id, left_kind, left_id, right_kind, right_id)
  WHERE unmatched_at IS NULL;
CREATE INDEX IF NOT EXISTS bank_reconciliation_matches_ws_status
  ON bank_reconciliation_matches(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_ws_id
  ON bank_reconciliation_matches(workspace_id, id);

/* Tautan pesanan marketplace ke penjualan/invoice internal (tanpa double count). */
CREATE TABLE IF NOT EXISTS marketplace_order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  link_kind text NOT NULL,
  link_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'linked',
  amount BIGINT,
  currency text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_links_key
  ON marketplace_order_links(workspace_id, order_id, link_kind, link_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_links_ws_id
  ON marketplace_order_links(workspace_id, id);

/* Baris settlement: pertahankan nilai MENTAH sumber di kolom terpisah supaya
   perbaikan pemetaan tidak menimpa data posted. */
ALTER TABLE marketplace_settlement_lines
  ADD COLUMN IF NOT EXISTS settlement_summary_id uuid,
  ADD COLUMN IF NOT EXISTS line_type_raw text,
  ADD COLUMN IF NOT EXISTS gross_sales_amount BIGINT,
  ADD COLUMN IF NOT EXISTS seller_discount_amount BIGINT,
  ADD COLUMN IF NOT EXISTS platform_discount_amount BIGINT,
  ADD COLUMN IF NOT EXISTS refund_amount BIGINT;

/* Header pesanan: simpan nilai mentah sumber + kolom yang dipakai KPI. */
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS order_status_raw text,
  ADD COLUMN IF NOT EXISTS purchase_channel text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS buyer_reference_masked text,
  ADD COLUMN IF NOT EXISTS order_updated_at date;
ALTER TABLE marketplace_orders
  ALTER COLUMN order_updated_at TYPE date USING order_updated_at::date;

/* RLS: ENABLE + FORCE + policy workspace untuk semua tabel baru */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'marketplace_order_items', 'marketplace_settlement_summaries', 'marketplace_external_payment_references',
    'marketplace_sku_mappings', 'bank_account_aliases', 'bank_reconciliation_matches', 'marketplace_order_links'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

/* FK komposit tenant-aware (kolom tunggal sudah punya FK; ini menambah pasangan tenant) */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_order_items_channel_fk') THEN
    ALTER TABLE marketplace_order_items ADD CONSTRAINT mkt_order_items_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_order_items_batch_fk') THEN
    ALTER TABLE marketplace_order_items ADD CONSTRAINT mkt_order_items_batch_fk
      FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_summaries_channel_fk') THEN
    ALTER TABLE marketplace_settlement_summaries ADD CONSTRAINT mkt_settlement_summaries_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_summaries_batch_fk') THEN
    ALTER TABLE marketplace_settlement_summaries ADD CONSTRAINT mkt_settlement_summaries_batch_fk
      FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_ext_payment_refs_channel_fk') THEN
    ALTER TABLE marketplace_external_payment_references ADD CONSTRAINT mkt_ext_payment_refs_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_ext_payment_refs_summary_fk') THEN
    ALTER TABLE marketplace_external_payment_references ADD CONSTRAINT mkt_ext_payment_refs_summary_fk
      FOREIGN KEY (workspace_id, settlement_summary_id) REFERENCES marketplace_settlement_summaries(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_ext_payment_refs_line_fk') THEN
    ALTER TABLE marketplace_external_payment_references ADD CONSTRAINT mkt_ext_payment_refs_line_fk
      FOREIGN KEY (workspace_id, settlement_line_id) REFERENCES marketplace_settlement_lines(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_sku_mappings_channel_fk') THEN
    ALTER TABLE marketplace_sku_mappings ADD CONSTRAINT mkt_sku_mappings_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_sku_mappings_product_fk') THEN
    ALTER TABLE marketplace_sku_mappings ADD CONSTRAINT mkt_sku_mappings_product_fk
      FOREIGN KEY (workspace_id, product_id) REFERENCES products(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statements_alias_fk') THEN
    ALTER TABLE bank_statements ADD CONSTRAINT bank_statements_alias_fk
      FOREIGN KEY (workspace_id, bank_alias_id) REFERENCES bank_account_aliases(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_alias_fk') THEN
    ALTER TABLE bank_statement_lines ADD CONSTRAINT bank_statement_lines_alias_fk
      FOREIGN KEY (workspace_id, bank_alias_id) REFERENCES bank_account_aliases(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_lines_summary_fk') THEN
    ALTER TABLE marketplace_settlement_lines ADD CONSTRAINT mkt_settlement_lines_summary_fk
      FOREIGN KEY (workspace_id, settlement_summary_id) REFERENCES marketplace_settlement_summaries(workspace_id, id) ON DELETE SET NULL;
  END IF;
END
$$;

/* Hak akses peran aplikasi (pola sama seperti migrasi 002/003/018) */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  marketplace_order_items, marketplace_settlement_summaries, marketplace_external_payment_references,
  marketplace_sku_mappings, bank_account_aliases, bank_reconciliation_matches, marketplace_order_links
TO bf_app;

COMMENT ON TABLE marketplace_order_items IS 'Catatan rincian item pesanan marketplace hasil impor berkas; tidak mengubah stok/HPP dan tidak menyinkronkan apa pun.';
COMMENT ON TABLE marketplace_settlement_summaries IS 'Catatan ringkasan statement settlement menurut sumber; bukan kas diterima.';
COMMENT ON TABLE bank_reconciliation_matches IS 'Relasi audit pencocokan (1-1, 1-N, N-1, parsial). Tidak mengubah nilai sumber dan tidak memindahkan dana.';
COMMENT ON TABLE bank_account_aliases IS 'Alias rekening (label + maksimal 4 digit terakhir). Tanpa nomor penuh dan tanpa kredensial.';
` },
  { id: '022_import_jobs', checksum: '7d8f48eb311ec90616b5d830689a441d38c68a20548ebcb7162e5acab7486d24', sql: `-- 022_import_jobs: job langkah-kecil untuk impor besar + gerbang visibilitas baris
-- hasil impor (prompt R15 §2.1 / BF-088).
--
-- Sifat: aditif dan idempoten; melanjutkan nomor setelah 021. Tidak ada kolom hash
-- berkas (G-NOFP). Uang tetap BIGINT unit minor di tabel tujuan; tabel ini hanya
-- menyimpan progres + opsi yang dipilih pengguna (tanpa isi baris berkas).
--
-- \`published_at\` di tabel tujuan: baris hasil commit baru TERLIHAT oleh pembaca
-- (laporan/ekspor/rekonsiliasi) setelah diisi. Commit sinkron mengisinya dalam
-- transaksi yang sama; job langkah-kecil mengisinya hanya pada langkah penutup,
-- sehingga job yang dibatalkan/mati di tengah tidak pernah menampilkan data
-- setengah jadi.

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('PREVIEW', 'COMMIT')),
  state text NOT NULL DEFAULT 'QUEUED'
    CHECK (state IN ('QUEUED', 'RUNNING', 'PAUSED', 'DONE', 'FAILED', 'CANCELED')),
  report_type text NOT NULL,
  provider_code text,
  provider_label text,
  source_label text,
  filename text NOT NULL,
  sheet_name text NOT NULL,
  header_row integer NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsing jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_id uuid,
  cash_account_id uuid,
  bank_alias_id uuid,
  profile_id uuid,
  profile_version integer,
  total integer NOT NULL DEFAULT 0,
  cursor integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  valid integer NOT NULL DEFAULT 0,
  warning integer NOT NULL DEFAULT 0,
  needs_mapping integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  chunk_size integer NOT NULL DEFAULT 500,
  batch_id uuid,
  result jsonb,
  error_code text,
  error_params jsonb,
  attempts integer NOT NULL DEFAULT 0,
  locked_by text,
  locked_until timestamptz,
  created_by uuid,
  device_id uuid,
  operator text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);

CREATE INDEX IF NOT EXISTS import_jobs_ws_created
  ON import_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_pending
  ON import_jobs(state, created_at) WHERE state IN ('QUEUED', 'RUNNING');

/* Isi berkas unggahan untuk job, privat per workspace (dihapus saat job selesai). */
CREATE TABLE IF NOT EXISTS import_job_files (
  job_id uuid PRIMARY KEY REFERENCES import_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* Gerbang visibilitas: baris hasil impor hanya terlihat setelah diterbitkan. */
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE marketplace_settlement_summaries ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE marketplace_settlement_lines ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS published_at timestamptz;

/* Baris lama sudah dipakai laporan sebelum kolom ini ada: terbitkan sekali. */
UPDATE marketplace_orders SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE marketplace_order_items SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE marketplace_settlement_summaries SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE marketplace_settlement_lines SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE bank_statement_lines SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS marketplace_orders_published
  ON marketplace_orders(workspace_id, occurred_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_order_items_published
  ON marketplace_order_items(workspace_id, order_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS mkt_settlement_summaries_published
  ON marketplace_settlement_summaries(workspace_id, statement_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS mkt_settlement_lines_published
  ON marketplace_settlement_lines(workspace_id, statement_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_statement_lines_published
  ON bank_statement_lines(workspace_id, posted_on DESC) WHERE published_at IS NOT NULL;

/* RLS tenant: pola sama seperti migrasi 002/018/021. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_jobs', 'import_job_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

/*
 * Pekerja job harus melihat job SEMUA tenant untuk memilih yang tertua, sedangkan
 * permintaan pengguna tetap terkurung workspace-nya. Karena itu ada satu policy
 * tambahan yang hanya terbuka bila transaksi sistem menyetel \`app.job_runner='on'\`
 * (dilakukan \`withJobRunner\` di src/server/jobs/import-jobs.ts). Tidak ada jalur
 * request pengguna yang menyetel GUC tersebut.
 */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'job_runner' AND polrelid = 'import_jobs'::regclass) THEN
    CREATE POLICY job_runner ON import_jobs
      USING (current_setting('app.job_runner', true) = 'on')
      WITH CHECK (current_setting('app.job_runner', true) = 'on');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'job_runner' AND polrelid = 'import_job_files'::regclass) THEN
    CREATE POLICY job_runner ON import_job_files
      USING (current_setting('app.job_runner', true) = 'on')
      WITH CHECK (current_setting('app.job_runner', true) = 'on');
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_jobs, import_job_files TO bf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  marketplace_orders, marketplace_order_items, marketplace_settlement_summaries,
  marketplace_settlement_lines, bank_statement_lines
TO bf_app;

COMMENT ON TABLE import_jobs IS 'Job langkah-kecil impor (pratinjau/commit besar): progres, cursor, hitungan status, lease. Tanpa isi baris berkas.';
COMMENT ON TABLE import_job_files IS 'Isi berkas unggahan untuk job impor (privat per workspace, dihapus setelah job selesai).';
COMMENT ON COLUMN marketplace_orders.published_at IS 'Baris terlihat oleh laporan/ekspor hanya setelah terbit (commit selesai).';
` },
  { id: '023_import_job_totals', checksum: 'eb0602da9b5eec652ab3918608fc47425274f8f38ded836884225f3be5cb8bc1', sql: `-- 023_import_job_totals: total per mata uang yang sudah tercatat pada potongan-potongan
-- sebelumnya. Tanpa kolom ini, job commit yang dilanjutkan setelah proses mati akan
-- melaporkan total mata uang yang kurang (padahal barisnya sudah tersimpan).
-- Aditif & idempoten.

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS totals jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN import_jobs.totals IS 'Total unit minor per mata uang dari potongan yang sudah diproses (dipakai saat job dilanjutkan).';
` },
  { id: '024_import_job_file_encoding', checksum: 'a8547847f415aeec5560c3b566e639f7395c0e815a98410dd1d8382c0e82d4c9', sql: `-- 024_import_job_file_encoding: penanda encoding isi berkas job.
--
-- Berkas job disimpan terkompresi (gzip) supaya penulisan satu baris \`bytea\` besar
-- tidak menahan event loop (encoding hex 1,7 MB di JS memakan ratusan milidetik).
-- Dekompresi memakai threadpool Node, bukan event loop. Aditif & idempoten.

ALTER TABLE import_job_files ADD COLUMN IF NOT EXISTS encoding text NOT NULL DEFAULT 'gzip';

COMMENT ON COLUMN import_job_files.encoding IS 'Encoding isi berkas job: gzip (default) atau raw.';
` },
  { id: '025_export_report_kind', checksum: '1d9d66423c781b66030c5cc133a28f6f625394026cd3031212a0d33663acdf94', sql: `-- 025: perluas jenis riwayat ekspor untuk ekspor LAPORAN (R11-D §T5).
-- Aditif: nilai lama ('receipt','activity_summary') tetap sah; hanya menambah 'report_export'.
ALTER TABLE export_records DROP CONSTRAINT IF EXISTS export_records_kind_check;
ALTER TABLE export_records DROP CONSTRAINT IF EXISTS export_kind;
ALTER TABLE export_records
  ADD CONSTRAINT export_kind CHECK (kind IN ('receipt', 'activity_summary', 'report_export'));
` },
  { id: '026_vouchers_suppliers_rules', checksum: '4e33feaeba3b7e76faec38485770651eb481740ef97b99fa7dba939c52577c66', sql: `-- 026 (R11-E): voucher/loyalitas (CATATAN DISKON, bukan pembayaran), pusat aturan
-- workspace, dan penegasan RLS untuk direktori supplier yang sudah ada.
-- Aditif: tidak mengubah tabel lama.

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  percent_bp INTEGER CHECK (percent_bp IS NULL OR (percent_bp > 0 AND percent_bp <= 10000)),
  amount NUMERIC(18,2) CHECK (amount IS NULL OR amount > 0),
  min_purchase NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  max_discount NUMERIC(18,2) CHECK (max_discount IS NULL OR max_discount > 0),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  quota INTEGER CHECK (quota IS NULL OR quota > 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT vouchers_value_matches_kind CHECK (
    (kind = 'percent' AND percent_bp IS NOT NULL AND amount IS NULL) OR
    (kind = 'amount' AND amount IS NOT NULL AND percent_bp IS NULL)
  ),
  CONSTRAINT vouchers_period_valid CHECK (valid_to >= valid_from),
  CONSTRAINT vouchers_quota_not_exceeded CHECK (quota IS NULL OR used <= quota),
  UNIQUE (workspace_id, code)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_ws_active ON vouchers (workspace_id, is_active, valid_to);

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount_before NUMERIC(18,2) NOT NULL,
  discount_amount NUMERIC(18,2) NOT NULL CHECK (discount_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_ws ON voucher_redemptions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_rules (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  forecast_default_weeks INTEGER NOT NULL DEFAULT 13 CHECK (forecast_default_weeks BETWEEN 1 AND 52),
  low_stock_threshold NUMERIC(18,3) NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  invoice_due_days INTEGER NOT NULL DEFAULT 14 CHECK (invoice_due_days BETWEEN 1 AND 365),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- RLS ENABLE + FORCE + policy tenant untuk tiga tabel baru.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vouchers', 'voucher_redemptions', 'workspace_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vouchers, voucher_redemptions, workspace_rules TO bf_app;

-- Direktori supplier sudah ada tabelnya; GRANT dipastikan untuk peran aplikasi.
GRANT SELECT, INSERT, UPDATE ON TABLE suppliers TO bf_app;
` },
  { id: '027_documents', checksum: '131d58eabf74d64432c1e352925962e41d55fb91ba58cf2190753384108d0b48', sql: `-- 027 (R11-E / R19): DOKUMEN BERNOMOR + PDF SERVER.
-- Dokumen (faktur/penawaran/kuitansi/surat jalan) dicatat sebagai SNAPSHOT tetap setelah terbit
-- (immutable): koreksi hanya lewat dokumen pengganti/void bertanda. Nomor dialokasikan di dalam
-- transaksi yang sama dengan dokumen (doc_counters) sehingga tidak ada lubang walau rollback.
-- Kuitansi = CATATAN bahwa pembayaran diterima di luar aplikasi (tanpa tautan/tombol bayar).
-- Aditif: tidak mengubah tabel lama.

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'quotation', 'receipt', 'delivery_note')),
  number TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id UUID,
  template_key TEXT NOT NULL DEFAULT 'standard',
  template_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'voided')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by_device_id UUID,
  issued_by_operator TEXT,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  replaces_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documents_void_reason_required CHECK (status <> 'voided' OR voided_reason IS NOT NULL),
  UNIQUE (workspace_id, number)
);
CREATE INDEX IF NOT EXISTS documents_ws_kind_issued ON documents (workspace_id, kind, issued_at DESC);
CREATE INDEX IF NOT EXISTS documents_ws_source ON documents (workspace_id, source_kind, source_id);

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'quotation', 'receipt', 'delivery_note')),
  key TEXT NOT NULL DEFAULT 'standard',
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, key)
);

CREATE TABLE IF NOT EXISTS document_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

-- RLS ENABLE + FORCE + policy tenant untuk tiga tabel baru.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents', 'document_templates', 'document_template_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE documents TO bf_app;
GRANT SELECT, INSERT, UPDATE ON TABLE document_templates TO bf_app;
GRANT SELECT, INSERT ON TABLE document_template_versions TO bf_app;
` },
];

export const CANONICAL_MIGRATION_MANIFEST: Array<{ id: string; checksum: string }> =
  BUNDLED_MIGRATIONS.map(({ id, checksum }) => ({ id, checksum }));
