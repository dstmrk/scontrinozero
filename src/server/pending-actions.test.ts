// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockVerifyPendingSale,
  mockConfirmPendingSaleCandidate,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockVerifyPendingSale: vi.fn(),
  mockConfirmPendingSaleCandidate: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/services/pending-verification", () => ({
  verifyPendingSale: mockVerifyPendingSale,
  confirmPendingSaleCandidate: mockConfirmPendingSaleCandidate,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));

import {
  confirmPendingDocument,
  verifyPendingDocument,
} from "./pending-actions";

const BIZ = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";

describe("verifyPendingDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Chiave del rate limiter: un utente nuovo per test tiene i test
    // indipendenti fra loro senza resettare il limiter di modulo.
    mockGetAuthenticatedUser.mockResolvedValue({
      id: `user-${Math.random()}`,
    });
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockVerifyPendingSale.mockResolvedValue({
      outcome: "accepted",
      documentId: DOC,
    });
  });

  it("delega al servizio quando l'utente possiede il business", async () => {
    const result = await verifyPendingDocument(BIZ, DOC);

    expect(mockVerifyPendingSale).toHaveBeenCalledWith({
      businessId: BIZ,
      documentId: DOC,
    });
    expect(result).toEqual({ outcome: "accepted", documentId: DOC });
  });

  it("rifiuta un business che non è dell'utente", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({
      error: "Business non trovato o non autorizzato.",
    });

    const result = await verifyPendingDocument(BIZ, DOC);

    expect(result).toEqual({
      error: "Business non trovato o non autorizzato.",
    });
    expect(mockVerifyPendingSale).not.toHaveBeenCalled();
  });

  it("scarta un id malformato prima di arrivare al servizio (regola 9)", async () => {
    const result = await verifyPendingDocument(BIZ, "non-un-uuid");

    expect(result).toEqual({ error: "Richiesta non valida." });
    expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
    expect(mockVerifyPendingSale).not.toHaveBeenCalled();
  });

  it("degrada a { error } su sessione scaduta invece di propagare", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("no session"));

    const result = await verifyPendingDocument(BIZ, DOC);

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockVerifyPendingSale).not.toHaveBeenCalled();
  });

  it("blocca oltre il tetto orario: ogni verifica costa un login AdE", async () => {
    const userId = "utente-fisso";
    mockGetAuthenticatedUser.mockResolvedValue({ id: userId });

    const results = [];
    for (let i = 0; i < 21; i++) {
      results.push(await verifyPendingDocument(BIZ, DOC));
    }

    expect(results.at(-1)).toEqual({
      error: "Troppe verifiche ravvicinate. Riprova tra qualche minuto.",
    });
    expect(mockVerifyPendingSale).toHaveBeenCalledTimes(20);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});

describe("confirmPendingDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({
      id: `user-${Math.random()}`,
    });
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockConfirmPendingSaleCandidate.mockResolvedValue({
      outcome: "accepted",
      documentId: DOC,
    });
  });

  it("passa al servizio l'idtrx scelto dall'esercente", async () => {
    const result = await confirmPendingDocument(BIZ, DOC, "IDTRX-1");

    expect(mockConfirmPendingSaleCandidate).toHaveBeenCalledWith({
      businessId: BIZ,
      documentId: DOC,
      idtrx: "IDTRX-1",
    });
    expect(result).toMatchObject({ outcome: "accepted" });
  });

  it("rifiuta un idtrx vuoto", async () => {
    const result = await confirmPendingDocument(BIZ, DOC, "");

    expect(result).toEqual({ error: "Richiesta non valida." });
    expect(mockConfirmPendingSaleCandidate).not.toHaveBeenCalled();
  });

  it("rifiuta un idtrx assurdamente lungo prima di toccare AdE", async () => {
    const result = await confirmPendingDocument(BIZ, DOC, "x".repeat(129));

    expect(result).toEqual({ error: "Richiesta non valida." });
    expect(mockConfirmPendingSaleCandidate).not.toHaveBeenCalled();
  });

  it("richiede comunque l'ownership del business", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({ error: "Non autorizzato." });

    const result = await confirmPendingDocument(BIZ, DOC, "IDTRX-1");

    expect(result).toEqual({ error: "Non autorizzato." });
    expect(mockConfirmPendingSaleCandidate).not.toHaveBeenCalled();
  });
});
