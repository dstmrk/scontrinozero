import { relations } from "drizzle-orm";
import { profiles } from "./profiles";
import { businesses } from "./businesses";
import { adeCredentials } from "./ade-credentials";
import { commercialDocuments } from "./commercial-documents";
import { commercialDocumentLines } from "./commercial-document-lines";

export const profilesRelations = relations(profiles, ({ many }) => ({
  businesses: many(businesses),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [businesses.profileId],
    references: [profiles.id],
  }),
  adeCredentials: one(adeCredentials),
  commercialDocuments: many(commercialDocuments),
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
