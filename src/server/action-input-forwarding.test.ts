// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le tre server action fiscali (emissione, annullo, reso) validano l'input con
 * Zod e poi chiamano il servizio. Il servizio deve ricevere il valore
 * **validato** (`validation.data`), non l'oggetto grezzo del client: oggi i due
 * coincidono perché gli schemi non trasformano nulla, ma passare il grezzo
 * lascia che un campo in più arrivi fino al servizio e fa divergere "ciò che è
 * stato controllato" da "ciò che viene usato" alla prima trasformazione
 * aggiunta a uno schema (`.default()`, `.transform()`, `.trim()`).
 *
 * Un file a parte e non tre test dentro i file esistenti: emit e annullo hanno
 * lì i servizi veri su DB mockato, e per osservare l'argomento serve il
 * servizio sostituito.
 */

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
const mockCheckBusinessMembership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessMembership: (...args: unknown[]) =>
    mockCheckBusinessMembership(...args),
}));

const mockGetPlanSafe = vi.fn();
const mockCanEmit = vi.fn();
vi.mock("@/lib/plans", () => ({
  getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
  canEmit: (...args: unknown[]) => mockCanEmit(...args),
  TRIAL_EXPIRED_MESSAGE: "Prova scaduta.",
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockEmitReceiptForBusiness = vi.fn();
vi.mock("@/lib/services/receipt-service", () => ({
  emitReceiptForBusiness: (...args: unknown[]) =>
    mockEmitReceiptForBusiness(...args),
}));

const mockVoidReceiptForBusiness = vi.fn();
vi.mock("@/lib/services/void-service", () => ({
  voidReceiptForBusiness: (...args: unknown[]) =>
    mockVoidReceiptForBusiness(...args),
}));

const mockReturnReceiptForBusiness = vi.fn();
vi.mock("@/lib/services/return-service", () => ({
  returnReceiptForBusiness: (...args: unknown[]) =>
    mockReturnReceiptForBusiness(...args),
}));

import { emitReceipt } from "./receipt-actions";
import { returnReceipt } from "./return-actions";
import { voidReceipt } from "./void-actions";

const BIZ_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ID = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

/** Campo che nessuno schema dichiara: non deve mai superare la validazione. */
const EXTRA = { notInSchema: "campo-in-piu" };

/** Il titolare: oggi l'unico membro possibile di un'attività (issue #1099). */
const OWNER_MEMBERSHIP = { memberId: "member-owner", role: "owner" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockRateLimiterCheck.mockReturnValue({ success: true });
  mockGetPlanSafe.mockResolvedValue({
    ok: true,
    info: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
  });
  mockCanEmit.mockReturnValue(true);
  mockCheckBusinessMembership.mockResolvedValue(OWNER_MEMBERSHIP);
  mockEmitReceiptForBusiness.mockResolvedValue({ documentId: "doc-1" });
  mockVoidReceiptForBusiness.mockResolvedValue({ voidDocumentId: "void-1" });
  mockReturnReceiptForBusiness.mockResolvedValue({
    returnDocumentId: "return-1",
  });
});

describe("le server action passano al servizio il valore validato", () => {
  it("emitReceipt: nessun campo fuori schema arriva al servizio", async () => {
    const input = {
      businessId: BIZ_ID,
      lines: [
        {
          id: "line-1",
          description: "Pizza margherita",
          quantity: 2,
          grossUnitPrice: 10,
          vatCode: "10",
        },
      ],
      paymentMethod: "PC",
      idempotencyKey: KEY,
      ...EXTRA,
    } as never;

    await emitReceipt(input);

    expect(mockEmitReceiptForBusiness).toHaveBeenCalledTimes(1);
    const forwarded = mockEmitReceiptForBusiness.mock.calls[0][0];
    expect(forwarded).not.toHaveProperty("notInSchema");
    expect(forwarded).not.toBe(input);
    expect(forwarded).toMatchObject({
      businessId: BIZ_ID,
      idempotencyKey: KEY,
    });
  });

  it("voidReceipt: nessun campo fuori schema arriva al servizio", async () => {
    const input = {
      businessId: BIZ_ID,
      documentId: DOC_ID,
      idempotencyKey: KEY,
      ...EXTRA,
    } as never;

    await voidReceipt(input);

    expect(mockVoidReceiptForBusiness).toHaveBeenCalledTimes(1);
    const forwarded = mockVoidReceiptForBusiness.mock.calls[0][0];
    expect(forwarded).toEqual({
      businessId: BIZ_ID,
      documentId: DOC_ID,
      idempotencyKey: KEY,
    });
    expect(forwarded).not.toBe(input);
  });

  it("returnReceipt: nessun campo fuori schema arriva al servizio", async () => {
    const input = {
      businessId: BIZ_ID,
      documentId: DOC_ID,
      idempotencyKey: KEY,
      quantities: [1, 0],
      ...EXTRA,
    } as never;

    await returnReceipt(input);

    expect(mockReturnReceiptForBusiness).toHaveBeenCalledTimes(1);
    const forwarded = mockReturnReceiptForBusiness.mock.calls[0][0];
    expect(forwarded).toEqual({
      businessId: BIZ_ID,
      documentId: DOC_ID,
      idempotencyKey: KEY,
      quantities: [1, 0],
    });
    expect(forwarded).not.toBe(input);
  });

  it("il business verificato in ownership è quello passato al servizio", async () => {
    // Stessa fonte per il controllo e per l'uso: se le due letture divergessero
    // (una dal grezzo, una dal validato) l'ownership proteggerebbe un valore
    // diverso da quello che il servizio usa.
    await voidReceipt({
      businessId: BIZ_ID,
      documentId: DOC_ID,
      idempotencyKey: KEY,
    });

    expect(mockCheckBusinessMembership).toHaveBeenCalledWith("user-1", BIZ_ID);
    expect(mockVoidReceiptForBusiness.mock.calls[0][0].businessId).toBe(BIZ_ID);
  });
});

// Issue #1099: il documento è firmato dal membro trovato dal controllo di
// appartenenza, non da un id che arriva dal client.
describe("le server action firmano il documento col membro che opera", () => {
  it.each([
    [
      "emitReceipt",
      () =>
        emitReceipt({
          businessId: BIZ_ID,
          lines: [
            {
              id: "line-1",
              description: "Pizza",
              quantity: 1,
              grossUnitPrice: 5,
              vatCode: "10",
            },
          ],
          paymentMethod: "PC",
          idempotencyKey: KEY,
        } as never),
      () => mockEmitReceiptForBusiness,
    ],
    [
      "voidReceipt",
      () =>
        voidReceipt({
          businessId: BIZ_ID,
          documentId: DOC_ID,
          idempotencyKey: KEY,
        }),
      () => mockVoidReceiptForBusiness,
    ],
    [
      "returnReceipt",
      () =>
        returnReceipt({
          businessId: BIZ_ID,
          documentId: DOC_ID,
          idempotencyKey: KEY,
          quantities: [1, 0],
        }),
      () => mockReturnReceiptForBusiness,
    ],
  ])("%s passa l'id del membro come origine", async (_name, act, service) => {
    await act();

    expect(service().mock.calls[0][1]).toEqual({
      memberId: OWNER_MEMBERSHIP.memberId,
    });
  });
});
