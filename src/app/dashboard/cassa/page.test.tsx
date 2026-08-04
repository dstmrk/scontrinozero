// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const {
  mockGetOnboardingStatus,
  mockGetAuthenticatedUser,
  mockGetPlanSafe,
  mockFetchReceiptPrintHeader,
  mockLimit,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockFetchReceiptPrintHeader: vi.fn(),
  mockLimit: vi.fn(),
  // `redirect()` di Next funziona LANCIANDO NEXT_REDIRECT: il mock replica il
  // throw, così un eventuale catch largo nella pagina si vedrebbe subito come
  // fallback reso al posto del redirect.
  mockRedirect: vi.fn((..._args: unknown[]) => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: (...args: unknown[]) => mockGetOnboardingStatus(...args),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) =>
    mockGetAuthenticatedUser(...args),
}));

vi.mock("@/lib/receipts/print-header", () => ({
  fetchReceiptPrintHeader: (...args: unknown[]) =>
    mockFetchReceiptPrintHeader(...args),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: () => mockLimit() }) }),
    }),
  }),
}));

// `canUseDashboardCashier` è puro (plans-shared, no DB): implementazione reale
// così il gate developer_* è esercitato davvero, mockando solo la lettura DB.
vi.mock("@/lib/plans", async () => {
  const shared =
    await vi.importActual<typeof import("@/lib/plans-shared")>(
      "@/lib/plans-shared",
    );
  return {
    getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
    canUseDashboardCashier: shared.canUseDashboardCashier,
  };
});

vi.mock("@/components/cassa/cassa-client", () => ({
  CassaClient: () => <div data-testid="cassa-client" />,
}));

import CassaPage from "./page";

const PLAN_OK = {
  ok: true as const,
  info: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({ businessId: "biz-1" });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockFetchReceiptPrintHeader.mockResolvedValue({});
  mockLimit.mockResolvedValue([{ preferredVatCode: "22" }]);
});

describe("CassaPage — percorso nominale", () => {
  it("rende la cassa quando il piano è leggibile", async () => {
    mockGetPlanSafe.mockResolvedValue(PLAN_OK);

    render(await CassaPage());

    expect(screen.getByTestId("cassa-client")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("CassaPage — degrado della lettura del piano (REVIEW #85)", () => {
  it("rende il fallback inline senza lanciare quando il profilo manca", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error: "Profilo non disponibile. Contatta il supporto.",
    });

    render(await CassaPage());

    expect(
      screen.getByText("Profilo non disponibile. Contatta il supporto."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cassa-client")).not.toBeInTheDocument();
  });

  it("non interroga il DB per l'intestazione di stampa se il piano non è leggibile", async () => {
    // Il gate viene prima: senza piano la pagina non renderà la cassa, quindi
    // le query per prepararla sono lavoro sprecato proprio mentre il DB è
    // sotto pressione (il caso `57014` che ci ha portato qui).
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "boom" });

    render(await CassaPage());

    expect(mockFetchReceiptPrintHeader).not.toHaveBeenCalled();
    expect(mockLimit).not.toHaveBeenCalled();
  });
});

describe("CassaPage — il fallback non intercetta i redirect", () => {
  it("redirige ancora i piani developer_* alle API key (anti-NEXT_REDIRECT)", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: true,
      info: {
        plan: "developer_scale",
        trialStartedAt: null,
        planExpiresAt: null,
      },
    });

    await expect(CassaPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/settings#api-keys");
  });

  it("redirige ancora all'onboarding senza business", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });

    await expect(CassaPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });
});
