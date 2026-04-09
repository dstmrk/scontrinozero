// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetEffectivePlan,
  mockCanUseApi,
  mockGetApiKeyLimit,
  mockGenerateApiKey,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetEffectivePlan: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockGetApiKeyLimit: vi.fn(),
  mockGenerateApiKey: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
  getApiKeyLimit: mockGetApiKeyLimit,
}));

vi.mock("@/server/billing-actions", () => ({
  getEffectivePlan: mockGetEffectivePlan,
}));

vi.mock("@/lib/api-keys", () => ({
  generateApiKey: mockGenerateApiKey,
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  apiKeys: "api-keys-table",
  profiles: "profiles-table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  count: vi.fn().mockReturnValue("count()"),
}));

// --- Helpers ---

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

function makeSelectBuilderNoLimit(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  return builder;
}

// --- Fixtures ---

const FAKE_USER = { id: "auth-user-uuid" };
const FAKE_PROFILE = { id: "profile-uuid" };
const FAKE_KEY_LIST = [
  {
    id: "key-uuid-1",
    name: "My Integration",
    keyPrefix: "szk_live_XXX",
    createdAt: new Date("2026-03-01"),
    lastUsedAt: null,
    revokedAt: null,
  },
];

// --- Tests ---

describe("listApiKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockCanUseApi.mockReturnValue(true);
    mockSelect.mockReturnValue(makeSelectBuilderNoLimit(FAKE_KEY_LIST));
  });

  it("ritorna la lista delle API key attive per il business", async () => {
    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys("biz-uuid");

    expect(result.error).toBeUndefined();
    expect(result.keys).toHaveLength(1);
    expect(result.keys![0].name).toBe("My Integration");
  });

  it("ritorna errore se ownership check fallisce", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({
      error: "Business non trovato.",
    });

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys("biz-uuid");

    expect(result.error).toBeDefined();
    expect(result.keys).toBeUndefined();
  });

  it("ritorna errore se piano non supporta API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys("biz-uuid");

    expect(result.error).toMatch(/Pro/i);
  });

  it("ritorna le chiavi se getEffectivePlan risolve 'pro' anche se DB plan è ancora 'trial' (race condition)", async () => {
    // Simula la race condition: webhook non ancora arrivato ma subscription row presente
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockCanUseApi.mockReturnValue(true);

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys("biz-uuid");

    expect(result.error).toBeUndefined();
    expect(result.keys).toBeDefined();
  });
});

describe("createApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockCanUseApi.mockReturnValue(true);
    mockGetApiKeyLimit.mockReturnValue(null); // no limit by default
    mockGenerateApiKey.mockReturnValue({
      raw: "szk_live_TESTKEY48CHARSLONGBODYXXXXXXXXXXXXXXXXXXXXXXXX",
      hash: "abc123hash",
      prefix: "szk_live_XXX",
    });

    // Profile lookup
    mockSelect.mockReturnValue(makeSelectBuilder([FAKE_PROFILE]));

    // Insert chain: values → returning
    const mockReturning = vi.fn().mockResolvedValue([{ id: "new-key-uuid" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("genera una API key e ritorna la raw key una sola volta", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Test Key");

    expect(result.error).toBeUndefined();
    expect(result.apiKeyRaw).toBe(
      "szk_live_TESTKEY48CHARSLONGBODYXXXXXXXXXXXXXXXXXXXXXXXX",
    );
    expect(result.keyId).toBe("new-key-uuid");
  });

  it("ritorna errore se il nome è vuoto", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "  ");

    expect(result.error).toMatch(/nome/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se il nome supera 64 caratteri", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "A".repeat(65));

    expect(result.error).toMatch(/64/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accetta un nome di esattamente 64 caratteri", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "A".repeat(64));

    expect(result.error).toBeUndefined();
  });

  it("ritorna errore se ownership check fallisce", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({
      error: "Business non trovato.",
    });

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Test Key");

    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se piano non supporta API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Test Key");

    expect(result.error).toMatch(/Pro/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se profilo non trovato", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Test Key");

    expect(result.error).toMatch(/Profilo/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("createApiKey — limite per piano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockCanUseApi.mockReturnValue(true);
    mockGenerateApiKey.mockReturnValue({
      raw: "szk_live_TESTKEY48CHARSLONGBODYXXXXXXXXXXXXXXXXXXXXXXXX",
      hash: "abc123hash",
      prefix: "szk_live_XXX",
    });

    const mockReturning = vi.fn().mockResolvedValue([{ id: "new-key-uuid" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("blocca la creazione quando il piano Pro ha raggiunto il limite di 3 key", async () => {
    mockGetApiKeyLimit.mockReturnValue(3);
    // count query returns 3 (at limit)
    mockSelect.mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "3" }]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Fourth Key");

    expect(result.error).toMatch(/limite/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("consente la creazione quando ci sono 2 key attive su 3 permesse (slot libero)", async () => {
    mockGetApiKeyLimit.mockReturnValue(3);
    // count query returns 2 (below limit)
    mockSelect
      .mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "2" }]))
      .mockReturnValue(makeSelectBuilder([FAKE_PROFILE]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Third Key");

    expect(result.error).toBeUndefined();
    expect(result.apiKeyRaw).toBeDefined();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("nessun limite applicato per piano Unlimited (getApiKeyLimit ritorna null)", async () => {
    mockGetEffectivePlan.mockResolvedValue("unlimited");
    mockGetApiKeyLimit.mockReturnValue(null); // no limit
    // Only profile select — count query is NOT executed
    mockSelect.mockReturnValue(makeSelectBuilder([FAKE_PROFILE]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey("biz-uuid", "Unlimited Key");

    expect(result.error).toBeUndefined();
    expect(result.apiKeyRaw).toBeDefined();
    // count query must NOT be called (no mockSelectBuilderNoLimit setup)
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("revokeApiKey", () => {
  // Mock chain: update().set().where().returning() → array
  let mockUpdateReturning: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockSelect.mockReturnValue(makeSelectBuilder([FAKE_PROFILE]));

    mockUpdateReturning = vi.fn().mockResolvedValue([{ id: "key-uuid" }]);
    const mockUpdateWhere = vi
      .fn()
      .mockReturnValue({ returning: mockUpdateReturning });
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("revoca la chiave e ritorna senza errore", async () => {
    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey("key-uuid");

    expect(result.error).toBeUndefined();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("ritorna errore se la chiave non esiste o non appartiene all'utente", async () => {
    // Update matches 0 rows → returning() returns empty array
    mockUpdateReturning.mockResolvedValue([]);

    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey("nonexistent-key-uuid");

    expect(result.error).toMatch(/non trovata|non autorizzata/i);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("ritorna errore se profilo non trovato", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));

    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey("key-uuid");

    expect(result.error).toMatch(/Profilo/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
