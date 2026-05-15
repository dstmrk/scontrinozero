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
  eq: vi.fn((_col, val) => `eq(${String(val)})`),
  and: vi.fn((...args: unknown[]) => `and(${args.join(",")})`),
  or: vi.fn((...args: unknown[]) => `or(${args.join(",")})`),
  isNull: vi.fn((col) => `isNull(${String(col)})`),
  lt: vi.fn((col, val) => `lt(${String(col)},${String(val)})`),
}));

const mockLoggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn },
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

/**
 * Build a valid 57-char business key (prefix + 48 base64url chars).
 * The body is not a real random key — only format matters for these tests.
 */
const VALID_LIVE_KEY = "szk_live_" + "A".repeat(48);
const VALID_MGMT_KEY = "szk_mgmt_" + "B".repeat(48);

// --- Tests ---

describe("authenticateApiKey — format pre-check (no DB call)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
  });

  it("ritorna 401 senza query DB se la chiave ha prefisso errato", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer sk_live_" + "A".repeat(48) },
    });
    const result = await authenticateApiKey(request);
    expect(result).toEqual({ error: "API key non valida.", status: 401 });
    expect(mockSelectFields).not.toHaveBeenCalled();
  });

  it("ritorna 401 senza query DB se la chiave è troppo corta", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_XXXXXXXX" },
    });
    const result = await authenticateApiKey(request);
    expect(result).toEqual({ error: "API key non valida.", status: 401 });
    expect(mockSelectFields).not.toHaveBeenCalled();
  });

  it("ritorna 401 senza query DB se la chiave è troppo lunga", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_" + "A".repeat(100) },
    });
    const result = await authenticateApiKey(request);
    expect(result).toEqual({ error: "API key non valida.", status: 401 });
    expect(mockSelectFields).not.toHaveBeenCalled();
  });

  it("ritorna 401 senza query DB se il body contiene caratteri non base64url", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: "Bearer szk_live_" + "+".repeat(48) },
    });
    const result = await authenticateApiKey(request);
    expect(result).toEqual({ error: "API key non valida.", status: 401 });
    expect(mockSelectFields).not.toHaveBeenCalled();
  });
});

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
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: "API key non valida.",
      status: 401,
    });
    expect(mockSelectFields).toHaveBeenCalled();
  });

  it("P2-05: ritorna 401 generico se la key è revocata (no info leak su stato)", async () => {
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
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    const result = await authenticateApiKey(request);

    // Stesso body di "key non esiste" — il dettaglio resta solo nei log.
    expect(result).toEqual({
      error: "API key non valida.",
      status: 401,
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "revoked" }),
      expect.any(String),
    );
  });

  it("P2-05: ritorna 401 generico se la key è scaduta (no info leak su stato)", async () => {
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
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    const result = await authenticateApiKey(request);

    expect(result).toEqual({
      error: "API key non valida.",
      status: 401,
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "expired" }),
      expect.any(String),
    );
  });

  it("ritorna il contesto per una key valida", async () => {
    mockLimit.mockResolvedValue([FAKE_ROW]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
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
        headers: { authorization: `Bearer ${VALID_MGMT_KEY}` },
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
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    const result = await authenticateApiKey(request);

    expect("status" in result).toBe(false);
  });

  it("non propaga eccezioni se l'aggiornamento di last_used_at fallisce", async () => {
    mockLimit.mockResolvedValue([FAKE_ROW]);
    mockUpdateWhere.mockRejectedValue(new Error("DB connection error"));

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    const result = await authenticateApiKey(request);

    // Should still return success despite the failed fire-and-forget update
    expect("status" in result).toBe(false);
    // Allow the fire-and-forget catch to settle
    await Promise.resolve();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it("avvia l'aggiornamento di last_used_at (fire-and-forget)", async () => {
    mockLimit.mockResolvedValue([FAKE_ROW]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    await authenticateApiKey(request);

    expect(mockUpdate).toHaveBeenCalledWith("api-keys-table");
    expect(mockUpdateSet).toHaveBeenCalledWith({
      lastUsedAt: expect.any(Date),
    });
  });

  it("usa WHERE con soglia temporale per evitare write amplification", async () => {
    mockLimit.mockResolvedValue([FAKE_ROW]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { and, or, isNull, lt } = await import("drizzle-orm");
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    await authenticateApiKey(request);

    // Verifica che WHERE usi and(..., or(isNull, lt)) — non solo eq(id)
    expect(and).toHaveBeenCalled();
    expect(or).toHaveBeenCalled();
    expect(isNull).toHaveBeenCalled();
    expect(lt).toHaveBeenCalled();
  });

  it("non aggiorna last_used_at se aggiornato recentemente (< 10 min)", async () => {
    // lastUsedAt = 5 minuti fa (< soglia di 10 min): il WHERE non match
    // Il comportamento reale è gestito dal DB; qui verifichiamo che la soglia
    // venga inclusa nel WHERE come Date nel passato recente.
    const recentLastUsed = new Date(NOW.getTime() - 5 * 60 * 1000); // -5 min
    mockLimit.mockResolvedValue([
      {
        ...FAKE_ROW,
        apiKey: { ...FAKE_API_KEY, lastUsedAt: recentLastUsed },
      },
    ]);
    mockUpdateWhere.mockResolvedValue(undefined);

    const { lt } = await import("drizzle-orm");
    const { authenticateApiKey } = await import("./api-auth");
    const request = new Request("https://api.scontrinozero.it/v1/receipts", {
      headers: { authorization: `Bearer ${VALID_LIVE_KEY}` },
    });

    await authenticateApiKey(request);

    // Verifica che lt() venga chiamato con una soglia ~10 min prima di NOW
    expect(lt).toHaveBeenCalled();
    const ltCall = vi.mocked(lt).mock.calls[0];
    const threshold = ltCall[1] as Date;
    const expectedThreshold = new Date(NOW.getTime() - 10 * 60 * 1000);
    expect(threshold).toBeInstanceOf(Date);
    expect(
      Math.abs(threshold.getTime() - expectedThreshold.getTime()),
    ).toBeLessThan(1000);
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
