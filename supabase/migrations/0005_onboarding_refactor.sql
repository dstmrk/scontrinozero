ALTER TABLE "businesses" ALTER COLUMN "business_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "vat_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "street_number" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "preferred_vat_code" text;