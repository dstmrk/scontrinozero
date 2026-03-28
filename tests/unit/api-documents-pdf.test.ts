// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetUser,
  mockCreateServerSupabaseClient,
  mockGetDb,
  mockLimit,
  mockWhere,
  mockInnerJoin2,
  mockInnerJoin1,
  mockFrom,
  mockSelect,
  mockOrderBy,
  mockWhereLines,
  mockFromLines,
  mockSelectLines,
  mockGeneratePdfResponse,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCreateServerSupabaseClient: vi.fn(),
  mockGetDb: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockInnerJoin2: vi.fn(),
  mockInnerJoin1: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockOrderBy: vi.fn(),
  mockWhereLines: vi.fn(),
  mockFromLines: vi.fn(),
  mockSelectLines: vi.fn(),
  mockGeneratePdfResponse: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: {},
  commercialDocumentLines: {},
  businesses: {},
  profiles: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/receipts/generate-pdf-response", () => ({
  generatePdfResponse: mockGeneratePdfResponse,
}));

// --- Helpers ---

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(): Request {
  return new Request(`https://example.com/api/documents/${VALID_UUID}/pdf`);
}

function makeParams(documentId: string): {
  params: Promise<{ documentId: string }>;
} {
  return { params: Promise.resolve({ documentId }) };
}

describe("GET /api/documents/[documentId]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    // DB chain for main query (select called with fields object)
    mockLimit.mockResolvedValue([
      { doc: { id: VALID_UUID, kind: "SALE" }, biz: { name: "Biz" } },
    ]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInnerJoin2.mockReturnValue({ where: mockWhere });
    mockInnerJoin1.mockReturnValue({ innerJoin: mockInnerJoin2 });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin1 });

    // DB chain for lines query (select called with no args)
    mockOrderBy.mockResolvedValue([]);
    mockWhereLines.mockReturnValue({ orderBy: mockOrderBy });
    mockFromLines.mockReturnValue({ where: mockWhereLines });
    mockSelectLines.mockReturnValue({ from: mockFromLines });

    // Route uses a single getDb() call; distinguish by select() args
    mockSelect.mockImplementation((fields?: unknown) => {
      if (fields !== undefined) {
        return { from: mockFrom };
      }
      return { from: mockFromLines };
    });

    mockGetDb.mockReturnValue({ select: mockSelect });

    mockGeneratePdfResponse.mockReturnValue(
      new Response("pdf-content", { status: 200 }),
    );
  });

  describe("UUID validation", () => {
    it("returns 400 for a non-UUID documentId", async () => {
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      const res = await GET(makeRequest(), makeParams("not-a-uuid"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for a SQL injection documentId", async () => {
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      const id = "'; DROP TABLE documents; --";
      const res = await GET(makeRequest(), makeParams(id));
      expect(res.status).toBe(400);
    });

    it("does not query DB for invalid UUID", async () => {
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      await GET(makeRequest(), makeParams("invalid"));
      expect(mockGetDb).not.toHaveBeenCalled();
    });
  });

  describe("auth", () => {
    it("returns 401 when user not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      const res = await GET(makeRequest(), makeParams(VALID_UUID));
      expect(res.status).toBe(401);
    });
  });

  describe("business logic", () => {
    it("returns 404 when document not found", async () => {
      mockLimit.mockResolvedValue([]);
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      const res = await GET(makeRequest(), makeParams(VALID_UUID));
      expect(res.status).toBe(404);
    });

    it("returns 400 when document kind is not SALE", async () => {
      mockLimit.mockResolvedValue([
        { doc: { id: VALID_UUID, kind: "VOID" }, biz: {} },
      ]);
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      const res = await GET(makeRequest(), makeParams(VALID_UUID));
      expect(res.status).toBe(400);
    });

    it("calls generatePdfResponse and returns its result", async () => {
      const { GET } =
        await import("@/app/api/documents/[documentId]/pdf/route");
      const res = await GET(makeRequest(), makeParams(VALID_UUID));
      expect(mockGeneratePdfResponse).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });
});
