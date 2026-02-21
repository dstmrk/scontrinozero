CREATE TYPE "public"."document_kind" AS ENUM('SALE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'ACCEPTED', 'VOID_ACCEPTED', 'REJECTED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."closure_status" AS ENUM('PENDING', 'COMPLETED', 'ERROR');--> statement-breakpoint
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
CREATE TABLE "daily_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"closure_date" date NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"total_gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_vat" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "closure_status" DEFAULT 'PENDING' NOT NULL,
	"ade_request" jsonb,
	"ade_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_closures_business_date_unique" UNIQUE("business_id","closure_date")
);
--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_document_id_commercial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."commercial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closures" ADD CONSTRAINT "daily_closures_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;