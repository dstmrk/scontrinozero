import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { commercialDocumentLines } from "./commercial-document-lines";

describe("commercial_document_lines schema", () => {
  it("has the correct SQL table name", () => {
    expect(getTableName(commercialDocumentLines)).toBe(
      "commercial_document_lines",
    );
  });

  it("has all required columns", () => {
    const cols = Object.keys(commercialDocumentLines);
    expect(cols).toContain("id");
    expect(cols).toContain("documentId");
    expect(cols).toContain("lineIndex");
    expect(cols).toContain("description");
    expect(cols).toContain("quantity");
    expect(cols).toContain("grossUnitPrice");
    expect(cols).toContain("vatCode");
    expect(cols).toContain("adeLineId");
  });
});
