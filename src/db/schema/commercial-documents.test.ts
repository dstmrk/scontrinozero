import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { AdeResponse } from "@/lib/ade/types";

import {
  commercialDocuments,
  documentKindEnum,
  documentStatusEnum,
  type SelectCommercialDocument,
} from "./commercial-documents";

describe("commercial_documents schema", () => {
  it("has the correct SQL table name", () => {
    expect(getTableName(commercialDocuments)).toBe("commercial_documents");
  });

  it("has all required columns", () => {
    const cols = Object.keys(commercialDocuments);
    expect(cols).toContain("id");
    expect(cols).toContain("businessId");
    expect(cols).toContain("kind");
    expect(cols).toContain("idempotencyKey");
    expect(cols).toContain("publicRequest");
    expect(cols).toContain("adeResponse");
    expect(cols).toContain("adeTransactionId");
    expect(cols).toContain("adeProgressive");
    expect(cols).toContain("status");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("expone adeResponse tipato come AdeResponse, non unknown", () => {
    const value = {} as SelectCommercialDocument["adeResponse"];
    // Se la colonna regredisse a jsonb non tipizzato (unknown), questa
    // assegnazione fallirebbe `npm run type-check`.
    const typed: AdeResponse | null = value;
    expect(typed).toBeDefined();
  });

  it("document kind enum has correct values", () => {
    expect(documentKindEnum.enumValues).toEqual(["SALE", "VOID"]);
  });

  it("document status enum has correct values", () => {
    expect(documentStatusEnum.enumValues).toEqual([
      "PENDING",
      "ACCEPTED",
      "VOID_ACCEPTED",
      "REJECTED",
      "ERROR",
    ]);
  });
});
