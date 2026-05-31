import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ERROR_MESSAGES } from "@/lib/error-messages";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockFetchPublicReceipt = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/receipts/fetch-public-receipt", () => ({
  fetchPublicReceipt: (...args: unknown[]) => mockFetchPublicReceipt(...args),
}));

vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: (...args: unknown[]) => mockNotFound(...args),
}));

// Note: get-client-ip and rate-limit use real implementations.

// ─── Fixtures ───────────────────────────────────────────────────────────────

const VALID_DOC_ID = "123e4567-e89b-12d3-a456-426614174000";

const MOCK_RECEIPT_DATA = {
  doc: {
    id: "doc-1",
    publicRequest: { paymentMethod: "PC" },
    adeProgressive: "ABC-123",
    createdAt: new Date("2026-01-01T10:00:00Z"),
  },
  biz: {
    businessName: "Bar Mario",
    address: "Via Roma 1",
    city: "Milano",
    province: "MI",
    zipCode: "20100",
    vatNumber: "12345678901",
  },
  lines: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe("PublicReceiptPage rate limiting", () => {
  // Fresh import per test: the rate limiter is a module-level singleton, so
  // vi.resetModules() resets the 60-request budget between cases.
  let PublicReceiptPage: typeof import("./page").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "1.2.3.4" }),
    );
    vi.resetModules();
    ({ default: PublicReceiptPage } = await import("./page"));
  });

  function renderPage(documentId = VALID_DOC_ID) {
    return PublicReceiptPage({ params: Promise.resolve({ documentId }) });
  }

  it("renders the receipt when under the rate limit", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);

    render(await renderPage());

    expect(screen.getByText("Bar Mario")).toBeInTheDocument();
    expect(mockFetchPublicReceipt).toHaveBeenCalledWith(VALID_DOC_ID);
  });

  it("renders the rate-limit message after exceeding 60 requests per IP", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "9.9.9.9" }),
    );

    // Exhaust the 60-request budget for this IP (advance the limiter without
    // mounting — testing-library does not auto-clean DOM between renders within
    // a single test).
    for (let i = 0; i < 60; i++) {
      await renderPage();
    }

    render(await renderPage());

    expect(
      screen.getByText(ERROR_MESSAGES.RATE_LIMIT_PUBLIC_MINUTES),
    ).toBeInTheDocument();
  });

  it("does not query the DB once the limit is exceeded", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "8.8.8.8" }),
    );

    for (let i = 0; i < 60; i++) {
      await renderPage();
    }
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "8.8.8.8" }),
    );

    await renderPage();

    expect(mockFetchPublicReceipt).not.toHaveBeenCalled();
  });

  it("keys the limit per IP — a different IP gets its own budget", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);

    // Exhaust IP 1.1.1.1.
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "1.1.1.1" }),
    );
    for (let i = 0; i < 61; i++) {
      await renderPage();
    }

    // A distinct IP is unaffected.
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "2.2.2.2" }),
    );
    render(await renderPage());

    expect(screen.getByText("Bar Mario")).toBeInTheDocument();
    expect(mockFetchPublicReceipt).toHaveBeenCalledWith(VALID_DOC_ID);
  });
});
