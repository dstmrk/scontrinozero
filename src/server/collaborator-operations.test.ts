// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cosa può fare un collaboratore con le action fiscali (issue #1099): emette,
 * annulla i propri documenti, rende qualunque vendita dell'attività e verifica
 * i propri scontrini in sospeso, finché il piano del titolare ammette
 * collaboratori. I servizi sono sostituiti: qui conta se vengono chiamati.
 * `@/lib/business-permissions` è quello vero, sopra al DB mockato.
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
vi.mock("@/lib/plans", () => ({
  getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
  canEmit: () => true,
  TRIAL_EXPIRED_MESSAGE: "Prova scaduta.",
}));

const mockLimit = vi.fn();
vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: mockLimit }) }) }),
  }),
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

const mockVerifyPendingSale = vi.fn();
const mockConfirmPendingSaleCandidate = vi.fn();
vi.mock("@/lib/services/pending-verification", () => ({
  verifyPendingSale: (...args: unknown[]) => mockVerifyPendingSale(...args),
  confirmPendingSaleCandidate: (...args: unknown[]) =>
    mockConfirmPendingSaleCandidate(...args),
  PENDING_NOT_FOUND_ERROR:
    "Scontrino non trovato. Ricarica la pagina e riprova.",
}));

import {
  COLLABORATORS_SUSPENDED_MESSAGE,
  COLLABORATOR_CREDENTIALS_MESSAGE,
  COLLABORATOR_PASSWORD_EXPIRED_MESSAGE,
} from "@/lib/business-permissions";
import {
  CREDENTIALS_NOT_VERIFIED_MESSAGE,
  PASSWORD_EXPIRED_MESSAGE,
} from "@/lib/ade/error-messages";
import {
  confirmPendingDocument,
  verifyPendingDocument,
} from "./pending-actions";
import { emitReceipt } from "./receipt-actions";
import { returnReceipt } from "./return-actions";
import { voidReceipt } from "./void-actions";

const BIZ_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ID = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

const OWNER = { memberId: "member-owner", role: "owner" } as const;
const COLLABORATOR = {
  memberId: "member-collab",
  role: "collaborator",
} as const;

function planOf(plan: string) {
  return {
    ok: true,
    info: { plan, trialStartedAt: null, planExpiresAt: null },
  };
}

const emit = () =>
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
  } as never);
const voidIt = () =>
  voidReceipt({ businessId: BIZ_ID, documentId: DOC_ID, idempotencyKey: KEY });
const returnIt = () =>
  returnReceipt({
    businessId: BIZ_ID,
    documentId: DOC_ID,
    idempotencyKey: KEY,
    quantities: [1],
  });

const FISCAL_ACTIONS = [
  ["emitReceipt", emit, () => mockEmitReceiptForBusiness],
  ["voidReceipt", voidIt, () => mockVoidReceiptForBusiness],
  ["returnReceipt", returnIt, () => mockReturnReceiptForBusiness],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockRateLimiterCheck.mockReturnValue({ success: true });
  mockGetPlanSafe.mockResolvedValue(planOf("team"));
  mockCheckBusinessMembership.mockResolvedValue(COLLABORATOR);
  // Il documento è del collaboratore, salvo dove il test dice altrimenti.
  mockLimit.mockResolvedValue([{ id: DOC_ID }]);
  mockEmitReceiptForBusiness.mockResolvedValue({ documentId: "doc-1" });
  mockVoidReceiptForBusiness.mockResolvedValue({ voidDocumentId: "void-1" });
  mockReturnReceiptForBusiness.mockResolvedValue({
    returnDocumentId: "return-1",
  });
  mockVerifyPendingSale.mockResolvedValue({ outcome: "still_pending" });
  mockConfirmPendingSaleCandidate.mockResolvedValue({ outcome: "accepted" });
});

describe("sospensione del collaboratore", () => {
  it.each(FISCAL_ACTIONS)(
    "%s: con il titolare su Team il collaboratore opera e firma il documento",
    async (_name, act, service) => {
      await act();

      expect(service()).toHaveBeenCalledTimes(1);
      expect(service().mock.calls[0][1]).toEqual({
        memberId: COLLABORATOR.memberId,
      });
    },
  );

  it.each(FISCAL_ACTIONS)(
    "%s: con il titolare sceso a Pro il collaboratore è sospeso",
    async (_name, act, service) => {
      mockGetPlanSafe.mockResolvedValue(planOf("pro"));

      const result = await act();

      expect(result).toEqual({ error: COLLABORATORS_SUSPENDED_MESSAGE });
      expect(service()).not.toHaveBeenCalled();
    },
  );

  it.each(FISCAL_ACTIONS)(
    "%s: il titolare su Pro non è mai sospeso",
    async (_name, act, service) => {
      mockCheckBusinessMembership.mockResolvedValue(OWNER);
      mockGetPlanSafe.mockResolvedValue(planOf("pro"));

      await act();

      expect(service()).toHaveBeenCalledTimes(1);
    },
  );
});

describe("errori che solo il titolare può risolvere", () => {
  const passwordExpired = {
    error: PASSWORD_EXPIRED_MESSAGE,
    code: "ADE_PASSWORD_EXPIRED",
  };

  it.each(FISCAL_ACTIONS)(
    "%s: al collaboratore la password scaduta dice di avvisare il titolare",
    async (_name, act, service) => {
      service().mockResolvedValue(passwordExpired);

      await expect(act()).resolves.toEqual({
        error: COLLABORATOR_PASSWORD_EXPIRED_MESSAGE,
        code: "ADE_PASSWORD_EXPIRED",
      });
    },
  );

  it.each(FISCAL_ACTIONS)(
    "%s: al collaboratore le credenziali non verificate dicono di avvisare il titolare",
    async (_name, act, service) => {
      service().mockResolvedValue({ error: CREDENTIALS_NOT_VERIFIED_MESSAGE });

      await expect(act()).resolves.toEqual({
        error: COLLABORATOR_CREDENTIALS_MESSAGE,
      });
    },
  );

  it.each(FISCAL_ACTIONS)(
    "%s: il titolare riceve il messaggio originale",
    async (_name, act, service) => {
      mockCheckBusinessMembership.mockResolvedValue(OWNER);
      service().mockResolvedValue(passwordExpired);

      await expect(act()).resolves.toEqual(passwordExpired);
    },
  );
});

describe("documenti su cui il collaboratore agisce", () => {
  it("non annulla il documento di un altro membro", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await voidIt();

    expect(result).toEqual({
      error: "Scontrino non trovato.",
      code: "NOT_FOUND",
    });
    expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("rende anche la vendita di un altro membro, senza controllo d'autore", async () => {
    mockLimit.mockResolvedValue([]);

    await returnIt();

    expect(mockLimit).not.toHaveBeenCalled();
    expect(mockReturnReceiptForBusiness).toHaveBeenCalledTimes(1);
  });

  it("il titolare annulla qualunque documento senza la query d'autore", async () => {
    mockCheckBusinessMembership.mockResolvedValue(OWNER);

    await voidIt();

    expect(mockLimit).not.toHaveBeenCalled();
    expect(mockVoidReceiptForBusiness).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "verifyPendingDocument",
      () => verifyPendingDocument(BIZ_ID, DOC_ID),
      () => mockVerifyPendingSale,
    ],
    [
      "confirmPendingDocument",
      () => confirmPendingDocument(BIZ_ID, DOC_ID, "idtrx-1"),
      () => mockConfirmPendingSaleCandidate,
    ],
  ] as const)(
    "%s: verifica solo gli scontrini in sospeso propri",
    async (_name, act, service) => {
      mockLimit.mockResolvedValueOnce([]);
      await expect(act()).resolves.toEqual({
        error: "Scontrino non trovato. Ricarica la pagina e riprova.",
      });
      expect(service()).not.toHaveBeenCalled();

      mockLimit.mockResolvedValueOnce([{ id: DOC_ID }]);
      await act();
      expect(service()).toHaveBeenCalledTimes(1);
    },
  );
});
