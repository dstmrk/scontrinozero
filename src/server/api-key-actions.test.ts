// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/auth-errors";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetEffectivePlan,
  mockGetPlan,
  mockCanUseApi,
  mockGetApiKeyLimit,
  mockGenerateApiKey,
  mockIsNull,
  mockApiKeysTable,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetEffectivePlan: vi.fn(),
  mockGetPlan: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockGetApiKeyLimit: vi.fn(),
  mockGenerateApiKey: vi.fn(),
  mockIsNull: vi.fn(),
  // Colonne come oggetto (non stringa) per poter asserire su quale colonna
  // riceve isNull() nella WHERE della revoca.
  mockApiKeysTable: {
    id: "api_keys.id",
    profileId: "api_keys.profile_id",
    businessId: "api_keys.business_id",
    type: "api_keys.type",
    name: "api_keys.name",
    keyHash: "api_keys.key_hash",
    keyPrefix: "api_keys.key_prefix",
    createdAt: "api_keys.created_at",
    lastUsedAt: "api_keys.last_used_at",
    revokedAt: "api_keys.revoked_at",
  },
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

// `classifyPlanReadError` resta l'implementazione reale (REVIEW.md #78): qui
// interessa proprio che un ProfileNotFoundError sollevato dalla lettura del
// piano venga classificato e degradato, non il fatto che il mock ritorni una
// stringa qualsiasi.
vi.mock("@/lib/plans", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/plans")>("@/lib/plans");
  return {
    ProfileNotFoundError: actual.ProfileNotFoundError,
    classifyPlanReadError: actual.classifyPlanReadError,
    canUseApi: mockCanUseApi,
    getApiKeyLimit: mockGetApiKeyLimit,
    getEffectivePlan: mockGetEffectivePlan,
    getPlan: mockGetPlan,
  };
});

vi.mock("@/lib/api-keys", () => ({
  generateApiKey: mockGenerateApiKey,
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  }),
}));

vi.mock("@/db/schema", () => ({
  apiKeys: mockApiKeysTable,
  businesses: "businesses-table",
  profiles: "profiles-table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: mockIsNull,
  count: vi.fn().mockReturnValue("count()"),
}));

// --- Helpers ---

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    for: vi.fn().mockResolvedValue(result),
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

function makeSelectBuilderForUpdate(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

function setupPassthroughTransaction() {
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
      }),
  );
}

// --- Fixtures ---

const FAKE_USER = { id: "auth-user-uuid" };
const FAKE_PROFILE = { id: "profile-uuid" };
// UUID reali: businessId/keyId attraversano il guard isValidUuid (regola 9),
// quindi i fixture non possono più essere stringhe segnaposto.
const BIZ_ID = "11111111-2222-4333-8444-555555555555";
const KEY_ID = "99999999-8888-4777-8666-555555555555";
const OTHER_KEY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
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
    mockGetPlan.mockResolvedValue({
      plan: "pro",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    mockCanUseApi.mockReturnValue(true);
    mockSelect.mockReturnValue(makeSelectBuilderNoLimit(FAKE_KEY_LIST));
  });

  it("ritorna la lista delle API key attive per il business", async () => {
    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys(BIZ_ID);

    expect(result.error).toBeUndefined();
    expect(result.keys).toHaveLength(1);
    expect(result.keys![0].name).toBe("My Integration");
  });

  it("ritorna errore se ownership check fallisce", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({
      error: "Business non trovato.",
    });

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys(BIZ_ID);

    expect(result.error).toBeDefined();
    expect(result.keys).toBeUndefined();
  });

  it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys(BIZ_ID);

    expect(result.error).toBe("Non autenticato.");
    expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
  });

  it("ritorna errore se piano non supporta API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys(BIZ_ID);

    expect(result.error).toMatch(/Pro/i);
  });

  // Il default di canUseApi lascia il trial gated: se il guard smette di
  // inoltrare trialStartedAt, un account in prova perde l'accesso API senza
  // che nessun altro test se ne accorga (il gate è mockato).
  it("inoltra trialStartedAt al gate di piano", async () => {
    const trialStartedAt = new Date("2026-08-01T00:00:00Z");
    mockGetEffectivePlan.mockResolvedValue("trial");
    mockGetPlan.mockResolvedValue({
      plan: "trial",
      trialStartedAt,
      planExpiresAt: null,
    });

    const { listApiKeys } = await import("./api-key-actions");
    await listApiKeys(BIZ_ID);

    expect(mockCanUseApi).toHaveBeenCalledWith("trial", null, trialStartedAt);
  });

  // REVIEW.md #78: authorizeApiKeyBusiness leggeva il piano con una
  // Promise.all non protetta — un profilo orfano o uno statement timeout
  // propagavano fino all'error boundary di Next. Entrambe le promise possono
  // rigettare, quindi il guard copre la Promise.all, non il solo getPlan.
  it("degrada a { error } se il profilo è orfano (ProfileNotFoundError da getPlan)", async () => {
    const { ProfileNotFoundError } = await import("@/lib/plans");
    mockGetPlan.mockRejectedValue(new ProfileNotFoundError("user-1"));

    const { listApiKeys } = await import("./api-key-actions");

    await expect(listApiKeys(BIZ_ID)).resolves.toMatchObject({
      error: expect.stringContaining("Profilo non disponibile"),
    });
  });

  it("degrada a { error } se getEffectivePlan rigetta con un profilo orfano", async () => {
    const { ProfileNotFoundError } = await import("@/lib/plans");
    mockGetEffectivePlan.mockRejectedValue(new ProfileNotFoundError("user-1"));

    const { listApiKeys } = await import("./api-key-actions");

    await expect(listApiKeys(BIZ_ID)).resolves.toMatchObject({
      error: expect.stringContaining("Profilo non disponibile"),
    });
  });

  it("degrada a { error } sul sovraccarico del DB (statement timeout 57014)", async () => {
    mockGetPlan.mockRejectedValue(
      Object.assign(new Error("statement timeout"), { code: "57014" }),
    );

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys(BIZ_ID);

    expect(result.error).toMatch(/sovraccarico/i);
  });

  it("rilancia gli errori imprevisti della lettura del piano (restano in Sentry)", async () => {
    mockGetPlan.mockRejectedValue(new Error("network glitch"));

    const { listApiKeys } = await import("./api-key-actions");

    await expect(listApiKeys(BIZ_ID)).rejects.toThrow("network glitch");
  });

  it("ritorna le chiavi se getEffectivePlan risolve 'pro' anche se DB plan è ancora 'trial' (race condition)", async () => {
    // Simula la race condition: webhook non ancora arrivato ma subscription row presente
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockCanUseApi.mockReturnValue(true);

    const { listApiKeys } = await import("./api-key-actions");
    const result = await listApiKeys(BIZ_ID);

    expect(result.error).toBeUndefined();
    expect(result.keys).toBeDefined();
  });
});

describe("createApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTransaction();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockGetPlan.mockResolvedValue({
      plan: "pro",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    mockCanUseApi.mockReturnValue(true);
    mockGetApiKeyLimit.mockReturnValue(null); // no limit by default
    mockGenerateApiKey.mockReturnValue({
      raw: "szk_live_TESTKEY48CHARSLONGBODYXXXXXXXXXXXXXXXXXXXXXXXX",
      hash: "abc123hash",
      prefix: "szk_live_XXX",
    });

    // SELECT order: profile lookup, then SELECT ... FOR UPDATE on businesses
    // inside the transaction. With keyLimit=null the count query is skipped.
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
      .mockReturnValueOnce(makeSelectBuilderForUpdate([{ id: "biz-uuid" }]));

    // Insert chain: values → returning
    const mockReturning = vi.fn().mockResolvedValue([{ id: "new-key-uuid" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("genera una API key e ritorna la raw key una sola volta", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Test Key");

    expect(result.error).toBeUndefined();
    expect(result.apiKeyRaw).toBe(
      "szk_live_TESTKEY48CHARSLONGBODYXXXXXXXXXXXXXXXXXXXXXXXX",
    );
    expect(result.keyId).toBe("new-key-uuid");
  });

  it("ritorna errore se il nome è vuoto", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "  ");

    expect(result.error).toMatch(/nome/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se il nome supera 64 caratteri", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "A".repeat(65));

    expect(result.error).toMatch(/64/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accetta un nome di esattamente 64 caratteri", async () => {
    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "A".repeat(64));

    expect(result.error).toBeUndefined();
  });

  it("ritorna errore se ownership check fallisce", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({
      error: "Business non trovato.",
    });

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Test Key");

    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Test Key");

    expect(result.error).toBe("Non autenticato.");
    expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se piano non supporta API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Test Key");

    expect(result.error).toMatch(/Pro/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se profilo non trovato", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValue(makeSelectBuilder([]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Test Key");

    expect(result.error).toMatch(/Profilo/i);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("avvolge count + insert in una transaction (race condition guard)", async () => {
    mockGetApiKeyLimit.mockReturnValue(3);
    // Per questo test serve un terzo select per la count query.
    mockSelect.mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "1" }]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Race Key");

    expect(result.error).toBeUndefined();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("createApiKey — limite per piano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTransaction();
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
    // Order: profile → FOR UPDATE (businesses) → count (3 = at limit)
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
      .mockReturnValueOnce(makeSelectBuilderForUpdate([{ id: "biz-uuid" }]))
      .mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "3" }]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Fourth Key");

    expect(result.error).toMatch(/limite/i);
    expect(mockInsert).not.toHaveBeenCalled();
    // Transaction is entered (so the count check is serialised with insert)
    // even when the limit is reached: the early return happens inside the tx.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("consente la creazione quando ci sono 2 key attive su 3 permesse (slot libero)", async () => {
    mockGetApiKeyLimit.mockReturnValue(3);
    // Order: profile → FOR UPDATE → count (2 = below limit) → insert
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
      .mockReturnValueOnce(makeSelectBuilderForUpdate([{ id: "biz-uuid" }]))
      .mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "2" }]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Third Key");

    expect(result.error).toBeUndefined();
    expect(result.apiKeyRaw).toBeDefined();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("nessun limite applicato per piano Unlimited (getApiKeyLimit ritorna null)", async () => {
    mockGetEffectivePlan.mockResolvedValue("unlimited");
    mockGetApiKeyLimit.mockReturnValue(null); // no limit
    // Order: profile → FOR UPDATE → insert (count query skipped)
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
      .mockReturnValueOnce(makeSelectBuilderForUpdate([{ id: "biz-uuid" }]));

    const { createApiKey } = await import("./api-key-actions");
    const result = await createApiKey(BIZ_ID, "Unlimited Key");

    expect(result.error).toBeUndefined();
    expect(result.apiKeyRaw).toBeDefined();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("non inserisce se due richieste concorrenti vedrebbero entrambe N < limit (race condition serializzata)", async () => {
    // Pre-condition: 1 chiave attiva, limite 2. Simuliamo due chiamate
    // sequenziali (perché il mock transaction è passthrough). La prima
    // chiamata vede count=1 e inserisce. Senza il SELECT FOR UPDATE le due
    // count concorrenti potrebbero entrambe vedere count=1 in DB reale; col
    // lock la seconda vede count=2 dopo il commit della prima e viene
    // bloccata. Qui verifichiamo che la prima passa e la seconda viene
    // bloccata dalla logica di count + transaction.
    mockGetApiKeyLimit.mockReturnValue(2);

    // Prima chiamata: profile → FOR UPDATE → count=1 → insert OK
    // Seconda chiamata: profile → FOR UPDATE → count=2 → blocca
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
      .mockReturnValueOnce(makeSelectBuilderForUpdate([{ id: "biz-uuid" }]))
      .mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "1" }]))
      .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
      .mockReturnValueOnce(makeSelectBuilderForUpdate([{ id: "biz-uuid" }]))
      .mockReturnValueOnce(makeSelectBuilderNoLimit([{ count: "2" }]));

    const { createApiKey } = await import("./api-key-actions");
    const first = await createApiKey(BIZ_ID, "Key 1");
    const second = await createApiKey(BIZ_ID, "Key 2");

    expect(first.error).toBeUndefined();
    expect(second.error).toMatch(/limite/i);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(2);
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
    const result = await revokeApiKey(KEY_ID);

    expect(result.error).toBeUndefined();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey(KEY_ID);

    expect(result.error).toBe("Non autenticato.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("ritorna errore se la chiave non esiste o non appartiene all'utente", async () => {
    // Update matches 0 rows → returning() returns empty array
    mockUpdateReturning.mockResolvedValue([]);

    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey(OTHER_KEY_ID);

    expect(result.error).toMatch(/non trovata|non autorizzata/i);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("ritorna errore se profilo non trovato", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));

    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey(KEY_ID);

    expect(result.error).toMatch(/Profilo/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("filtra la UPDATE sulle sole chiavi non ancora revocate (revoca idempotente)", async () => {
    const { revokeApiKey } = await import("./api-key-actions");
    await revokeApiKey(KEY_ID);

    // Senza isNull(revokedAt) nella WHERE una seconda revoca sposterebbe
    // avanti revoked_at, corrompendo il timestamp di audit.
    expect(mockIsNull).toHaveBeenCalledWith(mockApiKeysTable.revokedAt);
  });

  it("una seconda revoca della stessa chiave è un no-op: nessuna riga aggiornata", async () => {
    // La chiave è già revocata → isNull(revokedAt) non matcha più nulla →
    // returning() vuoto → il branch "non trovata" esistente.
    mockUpdateReturning.mockResolvedValue([]);

    const { revokeApiKey } = await import("./api-key-actions");
    const result = await revokeApiKey(KEY_ID);

    expect(result.error).toMatch(/non trovata|non autorizzata/i);
    expect(mockUpdateReturning).toHaveBeenCalledTimes(1);
  });
});

describe("guard isValidUuid al boundary (regola 9)", () => {
  const INVALID_IDS = ["non-un-uuid", "", "1; DROP TABLE api_keys", "12345"];

  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTransaction();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEffectivePlan.mockResolvedValue("pro");
    mockGetPlan.mockResolvedValue({
      plan: "pro",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    mockCanUseApi.mockReturnValue(true);
    mockSelect.mockReturnValue(makeSelectBuilder([FAKE_PROFILE]));
  });

  it.each(INVALID_IDS)(
    "listApiKeys(%j) → errore senza toccare ownership né DB",
    async (badId) => {
      const { listApiKeys } = await import("./api-key-actions");
      const result = await listApiKeys(badId);

      expect(result).toEqual({ error: "Identificativo non valido." });
      expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    },
  );

  it.each(INVALID_IDS)(
    "createApiKey(%j) → errore senza transaction né insert",
    async (badId) => {
      const { createApiKey } = await import("./api-key-actions");
      const result = await createApiKey(badId, "Test Key");

      expect(result).toEqual({ error: "Identificativo non valido." });
      expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    },
  );

  it.each(INVALID_IDS)(
    "revokeApiKey(%j) → errore senza lookup profilo né update",
    async (badId) => {
      const { revokeApiKey } = await import("./api-key-actions");
      const result = await revokeApiKey(badId);

      expect(result).toEqual({ error: "Identificativo non valido." });
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  it("accetta un UUID maiuscolo (case-insensitive) e prosegue il flusso", async () => {
    const { listApiKeys } = await import("./api-key-actions");
    mockSelect.mockReturnValue(makeSelectBuilderNoLimit(FAKE_KEY_LIST));

    const result = await listApiKeys(BIZ_ID.toUpperCase());

    expect(result.error).toBeUndefined();
    expect(mockCheckBusinessOwnership).toHaveBeenCalled();
  });

  it("il guard sta DOPO l'auth: sessione scaduta + id invalido → 'Non autenticato.'", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    const { listApiKeys, revokeApiKey } = await import("./api-key-actions");

    expect(await listApiKeys("non-un-uuid")).toEqual({
      error: "Non autenticato.",
    });
    expect(await revokeApiKey("non-un-uuid")).toEqual({
      error: "Non autenticato.",
    });
  });
});
