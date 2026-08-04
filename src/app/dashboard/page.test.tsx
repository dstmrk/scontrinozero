// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const {
  mockGetOnboardingStatus,
  mockGetAuthenticatedUser,
  mockGetPlanSafe,
  mockGetCatalogItems,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockGetCatalogItems: vi.fn(),
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

vi.mock("@/server/catalog-actions", () => ({
  getCatalogItems: (...args: unknown[]) => mockGetCatalogItems(...args),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) =>
    mockGetAuthenticatedUser(...args),
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

vi.mock("@/components/catalogo/catalogo-client", () => ({
  CatalogoClient: () => <div data-testid="catalogo-client" />,
}));

import DashboardPage from "./page";

const PLAN_OK = {
  ok: true as const,
  info: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({ businessId: "biz-1" });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockGetCatalogItems.mockResolvedValue([]);
});

describe("DashboardPage — percorso nominale", () => {
  it("rende il catalogo quando il piano è leggibile", async () => {
    mockGetPlanSafe.mockResolvedValue(PLAN_OK);

    render(await DashboardPage());

    expect(screen.getByTestId("catalogo-client")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("DashboardPage — degrado della lettura del piano (REVIEW #85)", () => {
  it("rende il fallback inline senza lanciare quando il profilo manca", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error: "Profilo non disponibile. Contatta il supporto.",
    });

    render(await DashboardPage());

    expect(
      screen.getByText("Profilo non disponibile. Contatta il supporto."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("catalogo-client")).not.toBeInTheDocument();
  });

  it("rende il messaggio di sovraccarico DB, distinto dal profilo mancante", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error:
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
    });

    render(await DashboardPage());

    expect(
      screen.getByText(
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
      ),
    ).toBeInTheDocument();
  });

  it("non redirige quando la lettura del piano degrada", async () => {
    // Senza piano non si può decidere il gate: mandare l'utente su
    // /dashboard/settings#api-keys sarebbe una conclusione inventata.
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "boom" });

    render(await DashboardPage());

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("DashboardPage — il fallback non intercetta i redirect", () => {
  it("redirige ancora i piani developer_* alle API key (anti-NEXT_REDIRECT)", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: true,
      info: {
        plan: "developer_indie",
        trialStartedAt: null,
        planExpiresAt: null,
      },
    });

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/settings#api-keys");
  });

  it("redirige ancora all'onboarding senza business", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });
});
