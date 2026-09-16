// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
vi.mock("@/db", () => ({
  getDb: () => ({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  businesses: "businesses-table",
  adeCredentials: "ade-credentials-table",
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

const mockLoggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn: mockLoggerWarn } }));

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

const ROW = {
  businessName: "Mario Rossi",
  adeDenominazione: "ACME SRL",
  address: "Via Casa",
  streetNumber: "1",
  zipCode: "00100",
  city: "Roma",
  province: "RM",
  adeIndirizzo: "Via Roma",
  adeNumeroCivico: "10",
  adeCap: "20100",
  adeComune: "Milano",
  adeProvincia: "MI",
  utenzaPiva: "07790350966",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLeftJoin.mockReturnValue({ where: mockWhere });
  mockFrom.mockReturnValue({ leftJoin: mockLeftJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
});

// Contratto condiviso con `readAdeIdentityContext` in profile-actions: una
// copia sola di "quali colonne servono ai predicati".
describe("readAdeIdentityRow", () => {
  it("restituisce la riga letta", async () => {
    mockLimit.mockResolvedValueOnce([ROW]);
    const { readAdeIdentityRow } = await import("./ade-identity");

    await expect(readAdeIdentityRow(BUSINESS_ID)).resolves.toEqual(ROW);
  });

  it("restituisce null, non undefined, quando il business non c'è", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const { readAdeIdentityRow } = await import("./ade-identity");

    await expect(readAdeIdentityRow(BUSINESS_ID)).resolves.toBeNull();
  });

  // Propaga di proposito: come degradare lo decide chi chiama. La server
  // action deve poter dire all'utente che non ha funzionato; lo shell del
  // dashboard tace, e infatti lo avvolge in try/catch.
  it("propaga l'errore DB invece di inghiottirlo", async () => {
    mockLimit.mockRejectedValueOnce(new Error("statement timeout"));
    const { readAdeIdentityRow } = await import("./ade-identity");

    await expect(readAdeIdentityRow(BUSINESS_ID)).rejects.toThrow(
      "statement timeout",
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});

describe("loadAdeIdentityMismatches", () => {
  it("restituisce i due verdetti dalla riga letta", async () => {
    mockLimit.mockResolvedValueOnce([ROW]);
    const { loadAdeIdentityMismatches } = await import("./ade-identity");
    const result = await loadAdeIdentityMismatches(BUSINESS_ID);

    expect(result.denominazione?.kind).toBe("divergente");
    expect(result.sedeLegale?.kind).toBe("divergente");
  });

  it("tace su un'utenza 'me stesso'", async () => {
    mockLimit.mockResolvedValueOnce([{ ...ROW, utenzaPiva: null }]);
    const { loadAdeIdentityMismatches } = await import("./ade-identity");
    const result = await loadAdeIdentityMismatches(BUSINESS_ID);

    expect(result).toEqual({ denominazione: null, sedeLegale: null });
  });

  it("tace quando il business non esiste più", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const { loadAdeIdentityMismatches } = await import("./ade-identity");
    const result = await loadAdeIdentityMismatches(BUSINESS_ID);

    expect(result).toEqual({ denominazione: null, sedeLegale: null });
  });

  // Regola 19: questo sta nello shell del dashboard. Un throw sostituirebbe la
  // cassa con l'error boundary di Next per un banner che è solo informativo.
  it("degrada a silenzio se il DB fallisce, senza propagare", async () => {
    mockLimit.mockRejectedValueOnce(new Error("statement timeout"));
    const { loadAdeIdentityMismatches } = await import("./ade-identity");
    const result = await loadAdeIdentityMismatches(BUSINESS_ID);

    expect(result).toEqual({ denominazione: null, sedeLegale: null });
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  // Il fallimento è prevedibile e senza colpa dell'utente: warn, mai error,
  // altrimenti ogni timeout DB diventa una issue Sentry (regola 20).
  it("logga warn e non error", async () => {
    mockLimit.mockRejectedValueOnce(new Error("boom"));
    const { loadAdeIdentityMismatches } = await import("./ade-identity");
    await loadAdeIdentityMismatches(BUSINESS_ID);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      expect.any(String),
    );
  });

  it("legge una riga sola, con il JOIN sulle credenziali", async () => {
    mockLimit.mockResolvedValueOnce([ROW]);
    const { loadAdeIdentityMismatches } = await import("./ade-identity");
    await loadAdeIdentityMismatches(BUSINESS_ID);

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockLeftJoin).toHaveBeenCalledTimes(1);
    expect(mockLimit).toHaveBeenCalledWith(1);
  });
});
