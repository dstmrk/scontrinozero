import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
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

  // Issue #1099: l'autore di un documento fiscale è un membro dell'attività.
  // Una FK in cascata cancellerebbe i documenti insieme al membro: il vincolo
  // resta senza ON DELETE, e l'unica cancellazione è quella dell'attività.
  it("created_by punta a business_members e non cancella mai i documenti", () => {
    const fk = getTableConfig(commercialDocuments).foreignKeys.find(
      (key) => key.getName() === "fk_comm_docs_created_by",
    );
    expect(getTableName(fk!.reference().foreignTable)).toBe("business_members");
    expect(fk?.onDelete).not.toBe("cascade");
    expect(fk?.onDelete).not.toBe("set null");
    expect(commercialDocuments.createdBy.notNull).toBe(false);
  });

  it("indicizza l'autore per attività, per filtri e totali per collaboratore", () => {
    const index = getTableConfig(commercialDocuments).indexes.find(
      (idx) =>
        idx.config.name === "idx_commercial_documents_business_created_by",
    );
    expect(index).toBeDefined();
  });

  it("document kind enum has correct values", () => {
    expect(documentKindEnum.enumValues).toEqual(["SALE", "VOID", "RETURN"]);
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
