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
ALTER TABLE "ade_credentials" ADD CONSTRAINT "ade_credentials_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;