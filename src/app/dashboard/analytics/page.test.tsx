// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const {
  mockGetOnboardingStatus,
  mockGetAuthenticatedUser,
  mockGetPlanSafe,
  mockGetStarterKpis,
  mockGetAnalyticsBundle,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockGetStarterKpis: vi.fn(),
  mockGetAnalyticsBundle: vi.fn(),
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

// `canUsePro` è una funzione pura (plans-shared, no DB): forniamo
// l'implementazione reale così il gate trial/Pro è esercitato davvero, mockando
// solo `getPlanSafe` (che tocca il DB).
vi.mock("@/lib/plans", async () => {
  const shared =
    await vi.importActual<typeof import("@/lib/plans-shared")>(
      "@/lib/plans-shared",
    );
  return {
    getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
    canUsePro: shared.canUsePro,
  };
});

vi.mock("@/server/analytics-actions", () => ({
  getStarterKpis: (...args: unknown[]) => mockGetStarterKpis(...args),
  getAnalyticsBundle: (...args: unknown[]) => mockGetAnalyticsBundle(...args),
}));

// AnalyticsClient importa recharts dinamicamente: mockarlo evita di caricarlo
// nei test del ramo Pro e fornisce un marker semplice da asserire.
vi.mock("@/components/analytics/analytics-client", () => ({
  AnalyticsClient: ({ initialTruncated }: { initialTruncated?: boolean }) => (
    <div
      data-testid="analytics-client"
      data-truncated={String(initialTruncated ?? false)}
    />
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import AnalyticsPage from "./page";

const KPIS = { revenueCents: 12345, count: 7, aovCents: 1763, voidCount: 1 };

// La page ora riceve `searchParams` (Next 16 → Promise). Helper per costruire
// la prop con un range opzionale.
function pageProps(range?: string) {
  return { searchParams: Promise.resolve(range ? { range } : {}) };
}

/**
 * `getPlanSafe` ritorna un envelope `{ ok, info }` invece del solo `PlanInfo`
 * (REVIEW.md #85): l'helper evita di ripeterlo a ogni test e riempie i campi
 * trial/scadenza che la maggior parte dei casi non usa.
 */
function planOk(info: {
  plan: string;
  trialStartedAt?: Date | null;
  planExpiresAt?: Date | null;
}) {
  return {
    ok: true,
    info: { trialStartedAt: null, planExpiresAt: null, ...info },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({ businessId: "biz-1" });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
});

describe("AnalyticsPage — base view (Starter/Trial)", () => {
  it("renders KPI cards and the combined Pro upsell card, without AnalyticsClient", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "starter" }));
    mockGetStarterKpis.mockResolvedValue({ kpis: KPIS });

    render(await AnalyticsPage(pageProps()));

    // KPI labels (4 card) presenti
    expect(screen.getByText("Ricavi")).toBeInTheDocument();
    expect(screen.getByText("Scontrini emessi")).toBeInTheDocument();
    // Card upsell combinata unica
    expect(screen.getByText("Grafici avanzati · Pro")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Passa a Pro/i }),
    ).toBeInTheDocument();
    // Nessun grafico/AnalyticsClient nel ramo base
    expect(screen.queryByTestId("analytics-client")).not.toBeInTheDocument();
    // Solo i KPI base: niente bundle Pro
    expect(mockGetAnalyticsBundle).not.toHaveBeenCalled();
    expect(mockGetStarterKpis).toHaveBeenCalledWith("biz-1");
  });

  it("applies to expired Trial users (same base view)", async () => {
    mockGetPlanSafe.mockResolvedValue(
      planOk({
        plan: "trial",
        trialStartedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        planExpiresAt: null,
      }),
    );
    mockGetStarterKpis.mockResolvedValue({ kpis: KPIS });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByText("Grafici avanzati · Pro")).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-client")).not.toBeInTheDocument();
  });

  it("shows an inline error and zero KPIs when getStarterKpis fails", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "starter" }));
    mockGetStarterKpis.mockResolvedValue({ error: "boom" });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    // KPI azzerati → placeholder "—" per ricavi/conteggio
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("AnalyticsPage — Pro view", () => {
  it("renders the full AnalyticsClient for an active Trial (trial = Pro)", async () => {
    mockGetPlanSafe.mockResolvedValue(
      planOk({
        plan: "trial",
        trialStartedAt: new Date(),
        planExpiresAt: null,
      }),
    );
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
    });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByTestId("analytics-client")).toBeInTheDocument();
    expect(mockGetStarterKpis).not.toHaveBeenCalled();
    expect(mockGetAnalyticsBundle).toHaveBeenCalledWith("biz-1", "30d");
  });

  it("renders the full AnalyticsClient for Pro and fetches the bundle", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "pro" }));
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
    });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByTestId("analytics-client")).toBeInTheDocument();
    expect(mockGetStarterKpis).not.toHaveBeenCalled();
    expect(mockGetAnalyticsBundle).toHaveBeenCalledWith("biz-1", "30d");
  });

  it("onora il deep link ?range=90d (Pro) fetchando il bundle sul range richiesto", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "pro" }));
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
    });

    render(await AnalyticsPage(pageProps("90d")));

    expect(mockGetAnalyticsBundle).toHaveBeenCalledWith("biz-1", "90d");
  });

  it("ricade su 30d quando ?range= è invalido (no throw, no error boundary)", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "unlimited" }));
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
    });

    render(await AnalyticsPage(pageProps("bogus")));

    expect(mockGetAnalyticsBundle).toHaveBeenCalledWith("biz-1", "30d");
    expect(screen.getByTestId("analytics-client")).toBeInTheDocument();
  });
});

describe("AnalyticsPage — degrado della lettura del piano (REVIEW #85)", () => {
  it("rende il fallback inline senza lanciare quando il profilo manca", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error: "Profilo non disponibile. Contatta il supporto.",
    });

    render(await AnalyticsPage(pageProps()));

    expect(
      screen.getByText("Profilo non disponibile. Contatta il supporto."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-client")).not.toBeInTheDocument();
  });

  it("non sceglie una vista quando il piano non è leggibile", async () => {
    // È il piano a decidere fra vista base e vista Pro: senza, renderne una
    // significherebbe indovinare — un Pro si vedrebbe l'upsell del suo stesso
    // piano. Nessuna delle due query analytics deve nemmeno partire.
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error:
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
    });

    render(await AnalyticsPage(pageProps()));

    expect(mockGetStarterKpis).not.toHaveBeenCalled();
    expect(mockGetAnalyticsBundle).not.toHaveBeenCalled();
  });
});

describe("AnalyticsPage — dataset parziale (cap documenti)", () => {
  it("avvisa nella vista base quando i KPI Starter sono calcolati su un dataset troncato", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "starter" }));
    mockGetStarterKpis.mockResolvedValue({ kpis: KPIS, truncated: true });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByText(/Dati parziali/i)).toBeInTheDocument();
  });

  it("non avvisa nella vista base quando il dataset è completo", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "starter" }));
    mockGetStarterKpis.mockResolvedValue({ kpis: KPIS, truncated: false });

    render(await AnalyticsPage(pageProps()));

    expect(screen.queryByText(/Dati parziali/i)).not.toBeInTheDocument();
  });

  it("propaga il flag al client nella vista Pro", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "pro" }));
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
      truncated: true,
    });

    render(await AnalyticsPage(pageProps("ytd")));

    expect(screen.getByTestId("analytics-client")).toHaveAttribute(
      "data-truncated",
      "true",
    );
  });

  it("non segnala troncamento al client quando il bundle è completo", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "pro" }));
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
      truncated: false,
    });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByTestId("analytics-client")).toHaveAttribute(
      "data-truncated",
      "false",
    );
  });

  it("un bundle in errore non propaga il flag di dataset parziale", async () => {
    mockGetPlanSafe.mockResolvedValue(planOk({ plan: "pro" }));
    mockGetAnalyticsBundle.mockResolvedValue({ error: "boom" });

    render(await AnalyticsPage(pageProps()));

    expect(screen.getByTestId("analytics-client")).toHaveAttribute(
      "data-truncated",
      "false",
    );
  });
});
