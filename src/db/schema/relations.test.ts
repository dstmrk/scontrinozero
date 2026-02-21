import { describe, expect, it } from "vitest";

import {
  adeCredentialsRelations,
  businessesRelations,
  commercialDocumentLinesRelations,
  commercialDocumentsRelations,
  dailyClosuresRelations,
  profilesRelations,
} from "./relations";

describe("schema relations", () => {
  it("profilesRelations is defined", () => {
    expect(profilesRelations).toBeDefined();
  });

  it("businessesRelations is defined", () => {
    expect(businessesRelations).toBeDefined();
  });

  it("adeCredentialsRelations is defined", () => {
    expect(adeCredentialsRelations).toBeDefined();
  });

  it("commercialDocumentsRelations is defined", () => {
    expect(commercialDocumentsRelations).toBeDefined();
  });

  it("commercialDocumentLinesRelations is defined", () => {
    expect(commercialDocumentLinesRelations).toBeDefined();
  });

  it("dailyClosuresRelations is defined", () => {
    expect(dailyClosuresRelations).toBeDefined();
  });
});
