import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";

export const businesses = pgTable("businesses", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  businessName: text("business_name"),
  vatNumber: text("vat_number"),
  fiscalCode: text("fiscal_code"),
  address: text("address"),
  streetNumber: text("street_number"),
  city: text("city"),
  province: text("province"),
  zipCode: text("zip_code"),
  preferredVatCode: text("preferred_vat_code"),
  activityCode: text("activity_code"),
  taxRegime: text("tax_regime"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type InsertBusiness = typeof businesses.$inferInsert;
export type SelectBusiness = typeof businesses.$inferSelect;
