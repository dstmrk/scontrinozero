// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockGetDb,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockGetDb: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

// --- Helpers ---

function makeRequest(id: string): Request {
  return new Request(`https://example.com/api/v1/receipts/${id}`);
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/v1/receipts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: auth ok, plan ok, business key ok
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "pro",
      businessId: "biz-123",
    });
    mockCanUseApi.mockReturnValue(true);

    // Default DB chain
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockGetDb.mockReturnValue({ select: mockSelect });
  });

  describe("UUID validation", () => {
    it("returns 400 for a non-UUID id", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(
        makeRequest("not-a-uuid"),
        makeParams("not-a-uuid"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for a SQL injection id", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const id = "'; DROP TABLE documents; --";
      const res = await GET(makeRequest(id), makeParams(id));
      expect(res.status).toBe(400);
    });

    it("returns 400 for an empty id", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(""), makeParams(""));
      expect(res.status).toBe(400);
    });

    it("does not query DB for invalid UUID", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      await GET(makeRequest("invalid"), makeParams("invalid"));
      expect(mockGetDb).not.toHaveBeenCalled();
    });
  });

  describe("auth", () => {
    it("returns 401 when auth fails", async () => {
      mockIsApiKeyAuthError.mockReturnValue(true);
      mockAuthenticateApiKey.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(401);
    });

    it("returns 402 when plan does not include API access", async () => {
      mockCanUseApi.mockReturnValue(false);
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(402);
    });

    it("returns 403 when no businessId", async () => {
      mockAuthenticateApiKey.mockResolvedValue({
        plan: "pro",
        businessId: null,
      });
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(403);
    });
  });

  describe("business logic", () => {
    it("returns 404 when document not found", async () => {
      mockLimit.mockResolvedValue([]);
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(404);
    });

    it("returns 200 with document when found", async () => {
      const doc = { id: VALID_UUID, status: "SENT" };
      mockLimit.mockResolvedValue([doc]);
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(doc);
    });
  });
});
