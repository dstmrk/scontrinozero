import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";

export const businesses = pgTable(
  "businesses",
  {
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // UNIQUE(profile_id): l'app assume 1 business per profilo (migration 0016,
  // P1.2). Il vincolo crea già il proprio indice — niente index separato.
  (table) => [
    unique("businesses_profile_id_unique").on(table.profileId),
    // Defense-in-depth (migration 0019): length limit allineati a
    // BUSINESS_PROFILE_LIMITS in src/lib/validation.ts.
    check(
      "businesses_business_name_length_check",
      sql`char_length(${table.businessName}) <= 120`,
    ),
    check(
      "businesses_address_length_check",
      sql`char_length(${table.address}) <= 150`,
    ),
    check(
      "businesses_street_number_length_check",
      sql`char_length(${table.streetNumber}) <= 20`,
    ),
    check(
      "businesses_city_length_check",
      sql`char_length(${table.city}) <= 80`,
    ),
    check(
      "businesses_province_length_check",
      sql`char_length(${table.province}) <= 3`,
    ),
  ],
);

export type InsertBusiness = typeof businesses.$inferInsert;
export type SelectBusiness = typeof businesses.$inferSelect;
