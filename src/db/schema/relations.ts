import { relations } from "drizzle-orm";
import { profiles } from "./profiles";
import { businesses } from "./businesses";
import { adeCredentials } from "./ade-credentials";

export const profilesRelations = relations(profiles, ({ many }) => ({
  businesses: many(businesses),
}));

export const businessesRelations = relations(businesses, ({ one }) => ({
  profile: one(profiles, {
    fields: [businesses.profileId],
    references: [profiles.id],
  }),
  adeCredentials: one(adeCredentials),
}));

export const adeCredentialsRelations = relations(adeCredentials, ({ one }) => ({
  business: one(businesses, {
    fields: [adeCredentials.businessId],
    references: [businesses.id],
  }),
}));
