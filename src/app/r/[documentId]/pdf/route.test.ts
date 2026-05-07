// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TEST_BUSINESS_ID,
  INVALID_UUID,
} from "../../../../../tests/_helpers/fixtures";

const VALID_DOC_ID = TEST_BUSINESS_ID;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFetchPublicReceipt, mockGeneratePdfResponse } = vi.hoisted(() => ({
  mockFetchPublicReceipt: vi.fn(),
  mockGeneratePdfResponse: vi.fn(),
}));

vi.mock("@/lib/receipts/fetch-public-receipt", () => ({
  fetchPublicReceipt: (...args: unknown[]) => mockFetchPublicReceipt(...args),
}));

vi.mock("@/lib/receipts/generate-pdf-response", () => ({
  generatePdfResponse: (...args: unknown[]) => mockGeneratePdfResponse(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { GET } from "./route";

const MOCK_RECEIPT_DATA = {
  doc: { id: "doc-456", adeProgressive: "DCW2026/5111-0001" },
  biz: { businessName: "Negozio Test" },
  lines: [],
};

function makeRequest(documentId: string): Request {
  return new Request(`http://localhost/r/${documentId}/pdf`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /r/[documentId]/pdf (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);
    mockGeneratePdfResponse.mockResolvedValue(
      new Response(new Uint8Array(), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
        },
      }),
    );
  });

  it("ritorna 404 se fetchPublicReceipt ritorna null", async () => {
    mockFetchPublicReceipt.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(VALID_DOC_ID), {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(res.status).toBe(404);
  });

  it("delega a generatePdfResponse con i dati del documento", async () => {
    await GET(makeRequest(VALID_DOC_ID), {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(mockGeneratePdfResponse).toHaveBeenCalledWith(MOCK_RECEIPT_DATA);
  });

  it("ritorna la Response prodotta da generatePdfResponse", async () => {
    const res = await GET(makeRequest(VALID_DOC_ID), {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("non richiede autenticazione — nessuna dipendenza da Supabase", async () => {
    // Il route usa solo fetchPublicReceipt + generatePdfResponse.
    // Il test passa senza mock Supabase → conferma assenza di auth.
    const res = await GET(makeRequest(VALID_DOC_ID), {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(res.status).toBe(200);
  });

  it("ritorna 404 su UUID invalido senza chiamare il DB (regola 18 CLAUDE.md)", async () => {
    const res = await GET(makeRequest(INVALID_UUID), {
      params: Promise.resolve({ documentId: INVALID_UUID }),
    });

    expect(res.status).toBe(404);
    expect(mockFetchPublicReceipt).not.toHaveBeenCalled();
  });
});
