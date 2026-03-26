/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
const mockSelectFields = vi.fn().mockReturnValue({ from: mockFrom });

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelectFields,
    update: mockUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  apiKeys: "api-keys-table",
  profiles: "profiles-table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => `eq(${val})`),
}));

// --- Fixtures ---

const NOW = new Date("2026-03-26T10:00:00Z");

const FAKE_API_KEY = {
  id: "key-uuid-123",
  profileId: "profile-uuid-456",
  businessId: "biz-uuid-789",
  type: "business" as const,
  name: "Test Key",
  keyHash: "hash-placeholder",
  keyPrefix: "szk_live_XXX",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const FAKE_ROW = {
  apiKey: FAKE_API_KEY,
  plan: "pro",
  trialStartedAt: null,
};

// --- Tests ---

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
  });

  it("ritorna 401 se manca l'header Authorization", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts");

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: expect.stringContaining("API key mancante"),
      status: 401,
    });
  });

  it("ritorna 401 se l'header non inizia con Bearer", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: expect.stringContaining("API key mancante"),
      status: 401,
    });
  });

  it("ritorna 401 se la key non esiste nel DB", async () => {
    mockLimit.mockResolvedValue([]);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_unknownkey" },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: "API key non valida.",
      status: 401,
    });
  });

  it("ritorna 401 se la key è revocata", async () => {
    mockLimit.mockResolvedValue([
      {
        ...FAKE_ROW,
        apiKey: {
          ...FAKE_API_KEY,
          revokedAt: new Date("2026-03-20T00:00:00Z"),
        },
      },
    ]);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_revokedkey" },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: "API key revocata.",
      status: 401,
    });
  });

  it("ritorna 401 se la key è scaduta", async () => {
    mockLimit.mockResolvedValue([
      {
        ...FAKE_ROW,
        apiKey: {
          ...FAKE_API_KEY,
          expiresAt: new Date("2026-03-25T00:00:00Z"), // prima di NOW
        },
      },
    ]);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_expiredkey" },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: "API key scaduta.",
      status: 401,
    });
  });

  it("ritorna il contesto per una key valida", async () => {
    mockLimit.mockResolvedValue([FAKE_ROW]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_validkey" },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      apiKey: FAKE_API_KEY,
      profileId: "profile-uuid-456",
      businessId: "biz-uuid-789",
      plan: "pro",
      trialStartedAt: null,
    });
  });

  it("imposta businessId a null per management key", async () => {
    mockLimit.mockResolvedValue([
      {
        ...FAKE_ROW,
        apiKey: { ...FAKE_API_KEY, type: "management", businessId: null },
      },
    ]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request(
      "https://api.scontrinozero.it/v1/partner/businesses",
      {
        headers: { authorization: "Bearer szk_mgmt_validkey" },
      },
    );

    const result = await authenticateApiKey(request);

    expect((result as { businessId: null }).businessId).toBeNull();
  });

  it("accetta key non scaduta (expiresAt in futuro)", async () => {
    mockLimit.mockResolvedValue([
      {
        ...FAKE_ROW,
        apiKey: {
          ...FAKE_API_KEY,
          expiresAt: new Date("2027-01-01T00:00:00Z"), // dopo NOW
        },
      },
    ]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_futureexpiry" },
    });

    const result = await authenticateApiKey(request);

    expect("status" in result).toBe(false);
  });

  it("avvia l'aggiornamento di last_used_at (fire-and-forget)", async () => {
    mockLimit.mockResolvedValue([FAKE_ROW]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_validkey" },
    });

    await authenticateApiKey(request);

    expect(mockUpdate).toHaveBeenCalledWith("api-keys-table");
    expect(mockUpdateSet).toHaveBeenCalledWith({
      lastUsedAt: expect.any(Date),
    });
  });
});

describe("isApiKeyAuthError", () => {
  it("ritorna true per un errore di autenticazione", async () => {
    const { isApiKeyAuthError } = await import("./api-auth");
    expect(isApiKeyAuthError({ error: "Non valida.", status: 401 })).toBe(true);
  });

  it("ritorna false per un contesto valido", async () => {
    const { isApiKeyAuthError } = await import("./api-auth");
    const context = {
      apiKey: FAKE_API_KEY,
      profileId: "p",
      businessId: "b",
      plan: "pro" as const,
      trialStartedAt: null,
    };
    expect(isApiKeyAuthError(context)).toBe(false);
  });
});
