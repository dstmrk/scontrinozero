CREATE TYPE "public"."document_kind" AS ENUM('SALE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'ACCEPTED', 'VOID_ACCEPTED', 'REJECTED', 'ERROR');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"full_name" text,
	"first_name" text,
	"last_name" text,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"plan" text DEFAULT 'trial' NOT NULL,
	"trial_started_at" timestamp with time zone DEFAULT now(),
	"plan_expires_at" timestamp with time zone,
	"partita_iva" text,
	CONSTRAINT "profiles_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "profiles_partita_iva_unique" UNIQUE("partita_iva")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"business_name" text,
	"vat_number" text,
	"fiscal_code" text,
	"address" text,
	"street_number" text,
	"city" text,
	"province" text,
	"zip_code" text,
	"preferred_vat_code" text,
	"activity_code" text,
	"tax_regime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ade_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"encrypted_codice_fiscale" text NOT NULL,
	"encrypted_password" text NOT NULL,
	"encrypted_pin" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ade_credentials_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"public_request" jsonb,
	"ade_request" jsonb,
	"ade_response" jsonb,
	"ade_transaction_id" text,
	"ade_progressive" text,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_documents_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "commercial_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_index" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"gross_unit_price" numeric(10, 2) NOT NULL,
	"vat_code" text NOT NULL,
	"ade_line_id" text
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"description" text NOT NULL,
	"default_price" numeric(10, 2),
	"default_vat_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"status" text,
	"current_period_end" timestamp with time zone,
	"interval" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ade_credentials" ADD CONSTRAINT "ade_credentials_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "cd_lines_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."commercial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_businesses_profile_id" ON "businesses" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_commercial_documents_business_created" ON "commercial_documents" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_commercial_documents_business_status" ON "commercial_documents" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "idx_commercial_document_lines_document_id" ON "commercial_document_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_items_business_id" ON "catalog_items" USING btree ("business_id");