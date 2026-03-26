import { relations } from "drizzle-orm";
import { profiles } from "./profiles";
import { businesses } from "./businesses";
import { adeCredentials } from "./ade-credentials";
import { commercialDocuments } from "./commercial-documents";
import { commercialDocumentLines } from "./commercial-document-lines";
import { catalogItems } from "./catalog-items";
import { apiKeys } from "./api-keys";

export const profilesRelations = relations(profiles, ({ many }) => ({
  businesses: many(businesses),
  apiKeys: many(apiKeys),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [businesses.profileId],
    references: [profiles.id],
  }),
  adeCredentials: one(adeCredentials),
  commercialDocuments: many(commercialDocuments),
  catalogItems: many(catalogItems),
  apiKeys: many(apiKeys),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  profile: one(profiles, {
    fields: [apiKeys.profileId],
    references: [profiles.id],
  }),
  business: one(businesses, {
    fields: [apiKeys.businessId],
    references: [businesses.id],
  }),
}));

export const catalogItemsRelations = relations(catalogItems, ({ one }) => ({
  business: one(businesses, {
    fields: [catalogItems.businessId],
    references: [businesses.id],
  }),
}));

export const adeCredentialsRelations = relations(adeCredentials, ({ one }) => ({
  business: one(businesses, {
    fields: [adeCredentials.businessId],
    references: [businesses.id],
  }),
}));

export const commercialDocumentsRelations = relations(
  commercialDocuments,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [commercialDocuments.businessId],
      references: [businesses.id],
    }),
    apiKey: one(apiKeys, {
      fields: [commercialDocuments.apiKeyId],
      references: [apiKeys.id],
    }),
    lines: many(commercialDocumentLines),
  }),
);

export const commercialDocumentLinesRelations = relations(
  commercialDocumentLines,
  ({ one }) => ({
    document: one(commercialDocuments, {
      fields: [commercialDocumentLines.documentId],
      references: [commercialDocuments.id],
    }),
  }),
);
