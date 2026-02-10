import { relations } from "drizzle-orm";
import { profiles } from "./profiles";
import { businesses } from "./businesses";

export const profilesRelations = relations(profiles, ({ many }) => ({
  businesses: many(businesses),
}));

export const businessesRelations = relations(businesses, ({ one }) => ({
  profile: one(profiles, {
    fields: [businesses.profileId],
    references: [profiles.id],
  }),
}));
