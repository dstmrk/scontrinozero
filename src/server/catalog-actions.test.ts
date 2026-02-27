// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessOwnership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
}));

const mockOrderBy = vi.fn().mockResolvedValue([]);
const mockLimit = vi.fn().mockResolvedValue([]);
const mockSelectWhere = vi
  .fn()
  .mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  }),
}));

vi.mock("@/db/schema", () => ({
  catalogItems: "catalog-items-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Fixtures ---

const FAKE_USER = { id: "user-123" };
const FAKE_BUSINESS_ID = "biz-456";
const FAKE_ITEM_ID = "item-789";

const FAKE_ITEM = {
  id: FAKE_ITEM_ID,
  businessId: FAKE_BUSINESS_ID,
  description: "Pizza margherita",
  defaultPrice: "9.50",
  defaultVatCode: "10",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const VALID_ADD_INPUT = {
  businessId: FAKE_BUSINESS_ID,
  description: "Caffè espresso",
  defaultPrice: "1.20",
  defaultVatCode: "22" as const,
};

// --- Tests ---

describe("catalog-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);

    mockOrderBy.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // getCatalogItems
  // ---------------------------------------------------------------------------

  describe("getCatalogItems", () => {
    it("restituisce lista vuota se utente non autenticato", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(
        new Error("Not authenticated"),
      );

      const { getCatalogItems } = await import("./catalog-actions");
      const result = await getCatalogItems(FAKE_BUSINESS_ID);

      expect(result).toEqual([]);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("restituisce lista vuota se business non appartiene all'utente", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { getCatalogItems } = await import("./catalog-actions");
      const result = await getCatalogItems(FAKE_BUSINESS_ID);

      expect(result).toEqual([]);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("restituisce la lista dei prodotti ordinati per descrizione", async () => {
      mockOrderBy.mockResolvedValue([FAKE_ITEM]);

      const { getCatalogItems } = await import("./catalog-actions");
      const result = await getCatalogItems(FAKE_BUSINESS_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(FAKE_ITEM_ID);
      expect(result[0].description).toBe("Pizza margherita");
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith("catalog-items-table");
    });

    it("restituisce lista vuota se il catalogo è vuoto", async () => {
      mockOrderBy.mockResolvedValue([]);

      const { getCatalogItems } = await import("./catalog-actions");
      const result = await getCatalogItems(FAKE_BUSINESS_ID);

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // addCatalogItem
  // ---------------------------------------------------------------------------

  describe("addCatalogItem", () => {
    it("ritorna errore se utente non autenticato", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(
        new Error("Not authenticated"),
      );

      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem(VALID_ADD_INPUT);

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("ritorna errore se business non appartiene all'utente", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem(VALID_ADD_INPUT);

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("ritorna errore se la descrizione è vuota", async () => {
      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem({
        ...VALID_ADD_INPUT,
        description: "",
      });

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/descrizione/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("ritorna errore se la descrizione è solo spazi", async () => {
      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem({
        ...VALID_ADD_INPUT,
        description: "   ",
      });

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("ritorna errore se il prezzo è negativo", async () => {
      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem({
        ...VALID_ADD_INPUT,
        defaultPrice: "-1.00",
      });

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/prezzo/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("ritorna errore se il prezzo non è un numero valido", async () => {
      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem({
        ...VALID_ADD_INPUT,
        defaultPrice: "abc",
      });

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("ritorna errore se il codice IVA non è valido", async () => {
      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem({
        ...VALID_ADD_INPUT,
        defaultVatCode: "99" as never,
      });

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/IVA/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("inserisce il prodotto nel DB e ritorna senza errore", async () => {
      const { addCatalogItem } = await import("./catalog-actions");
      const result = await addCatalogItem(VALID_ADD_INPUT);

      expect(result.error).toBeUndefined();
      expect(mockInsert).toHaveBeenCalledWith("catalog-items-table");
      const insertArg = mockInsertValues.mock.calls[0][0];
      expect(insertArg.businessId).toBe(FAKE_BUSINESS_ID);
      expect(insertArg.description).toBe("Caffè espresso");
      expect(insertArg.defaultPrice).toBe("1.20");
      expect(insertArg.defaultVatCode).toBe("22");
    });
  });

  // ---------------------------------------------------------------------------
  // deleteCatalogItem
  // ---------------------------------------------------------------------------

  describe("deleteCatalogItem", () => {
    it("ritorna errore se utente non autenticato", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(
        new Error("Not authenticated"),
      );

      const { deleteCatalogItem } = await import("./catalog-actions");
      const result = await deleteCatalogItem(FAKE_ITEM_ID, FAKE_BUSINESS_ID);

      expect(result.error).toBeDefined();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("ritorna errore se business non appartiene all'utente", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { deleteCatalogItem } = await import("./catalog-actions");
      const result = await deleteCatalogItem(FAKE_ITEM_ID, FAKE_BUSINESS_ID);

      expect(result.error).toBeDefined();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("ritorna errore se il prodotto non esiste o non appartiene al business", async () => {
      mockLimit.mockResolvedValue([]); // item not found

      const { deleteCatalogItem } = await import("./catalog-actions");
      const result = await deleteCatalogItem(FAKE_ITEM_ID, FAKE_BUSINESS_ID);

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/non trovato/i);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("elimina il prodotto e ritorna senza errore", async () => {
      mockLimit.mockResolvedValue([{ id: FAKE_ITEM_ID }]);

      const { deleteCatalogItem } = await import("./catalog-actions");
      const result = await deleteCatalogItem(FAKE_ITEM_ID, FAKE_BUSINESS_ID);

      expect(result.error).toBeUndefined();
      expect(mockDelete).toHaveBeenCalledWith("catalog-items-table");
      expect(mockDeleteWhere).toHaveBeenCalled();
    });
  });
});
