// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/auth-errors";

// Hoisted: il limiter nasce al caricamento del modulo, prima delle const.
const { mockRateLimiterCheck } = vi.hoisted(() => ({
  mockRateLimiterCheck: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessOwnership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
}));

const mockGetPlanSafe = vi.fn();
const mockCanEmit = vi.fn();
vi.mock("@/lib/plans", () => ({
  getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
  canEmit: (...args: unknown[]) => mockCanEmit(...args),
  TRIAL_EXPIRED_MESSAGE: "Prova scaduta.",
}));

const mockReturnReceiptForBusiness = vi.fn();
vi.mock("@/lib/services/return-service", () => ({
  returnReceiptForBusiness: (...args: unknown[]) =>
    mockReturnReceiptForBusiness(...args),
}));

import { returnReceipt } from "./return-actions";

const INPUT = {
  businessId: "11111111-1111-4111-8111-111111111111",
  documentId: "22222222-2222-4222-8222-222222222222",
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
  quantities: [1, 0],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockRateLimiterCheck.mockReturnValue({ success: true });
  mockGetPlanSafe.mockResolvedValue({
    ok: true,
    info: { plan: "starter", trialStartedAt: null, planExpiresAt: null },
  });
  mockCanEmit.mockReturnValue(true);
  mockCheckBusinessOwnership.mockResolvedValue(null);
  mockReturnReceiptForBusiness.mockResolvedValue({
    returnDocumentId: "return-1",
    adeProgressive: "DCW2026/5111-2190",
  });
});

describe("returnReceipt", () => {
  it("delega al servizio dopo auth, piano e ownership", async () => {
    const result = await returnReceipt(INPUT);

    expect(result.returnDocumentId).toBe("return-1");
    // Nessuna API key: il reso dalla cassa non è un reso della Developer API.
    expect(mockReturnReceiptForBusiness).toHaveBeenCalledWith(INPUT);
    expect(mockCheckBusinessOwnership).toHaveBeenCalledWith(
      "user-1",
      INPUT.businessId,
    );
  });

  // Il reso è su tutti i piani: è un obbligo fiscale dell'esercente, non
  // una feature. Il gate è lo stesso dell'emissione (piano attivo o prova).
  it("non chiede un piano Pro: basta poter emettere", async () => {
    await returnReceipt(INPUT);

    expect(mockCanEmit).toHaveBeenCalledWith("starter", null, null);
    expect(mockReturnReceiptForBusiness).toHaveBeenCalled();
  });

  it("prova scaduta: rifiuta senza toccare l'AdE", async () => {
    mockCanEmit.mockReturnValue(false);

    const result = await returnReceipt(INPUT);

    expect(result.error).toBe("Prova scaduta.");
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("piano non leggibile: degrada a { error } (regola 19)", async () => {
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "Errore piano." });

    const result = await returnReceipt(INPUT);

    expect(result.error).toBe("Errore piano.");
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("sessione scaduta: degrada a 'Non autenticato.' senza lanciare", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    const result = await returnReceipt(INPUT);

    expect(result.error).toBe("Non autenticato.");
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("oltre la soglia oraria: rifiuta senza toccare l'AdE", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false });

    const result = await returnReceipt(INPUT);

    expect(result.error).toMatch(/Troppi resi/);
    expect(mockRateLimiterCheck).toHaveBeenCalledWith("return:user-1");
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it.each([
    ["businessId non UUID", { businessId: "nope" }],
    ["documentId non UUID", { documentId: "nope" }],
    ["idempotencyKey non UUID", { idempotencyKey: "nope" }],
    ["quantità vuote", { quantities: [] }],
    ["quantità negativa", { quantities: [-1] }],
    ["quantità non finita", { quantities: [Number.POSITIVE_INFINITY] }],
    ["troppe righe", { quantities: Array.from({ length: 101 }, () => 0) }],
  ])("input non valido (%s): errore senza query", async (_label, patch) => {
    const result = await returnReceipt({ ...INPUT, ...patch });

    expect(result.error).toBeTruthy();
    expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("business di un altro utente: errore di ownership", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({ error: "Non autorizzato." });

    const result = await returnReceipt(INPUT);

    expect(result.error).toBe("Non autorizzato.");
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });
});
