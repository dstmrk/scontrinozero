// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const {
  mockGetOnboardingStatus,
  mockGetAuthenticatedUser,
  mockGetPlanSafe,
  mockSearchReceipts,
  mockFetchReceiptPrintHeader,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockSearchReceipts: vi.fn(),
  mockFetchReceiptPrintHeader: vi.fn(),
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

vi.mock("@/server/storico-actions", () => ({
  searchReceipts: (...args: unknown[]) => mockSearchReceipts(...args),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) =>
    mockGetAuthenticatedUser(...args),
}));

vi.mock("@/lib/receipts/print-header", () => ({
  fetchReceiptPrintHeader: (...args: unknown[]) =>
    mockFetchReceiptPrintHeader(...args),
}));

vi.mock("@/lib/plans", () => ({
  getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
}));

vi.mock("@/components/storico/storico-client", () => ({
  StoricoClient: ({ plan }: { plan: string }) => (
    <div data-testid="storico-client" data-plan={plan} />
  ),
}));

import StoricoPage from "./page";

function pageProps(params: Record<string, string> = {}) {
  return { searchParams: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({ businessId: "biz-1" });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockSearchReceipts.mockResolvedValue({ items: [], total: 0 });
  mockFetchReceiptPrintHeader.mockResolvedValue({});
});

describe("StoricoPage — percorso nominale", () => {
  it("rende lo storico quando il piano è leggibile", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: true,
      info: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
    });

    render(await StoricoPage(pageProps()));

    expect(screen.getByTestId("storico-client")).toHaveAttribute(
      "data-plan",
      "pro",
    );
  });
});

describe("StoricoPage — degrado della lettura del piano (REVIEW #85)", () => {
  it("rende il fallback inline senza lanciare quando il profilo manca", async () => {
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error: "Profilo non disponibile. Contatta il supporto.",
    });

    render(await StoricoPage(pageProps()));

    expect(
      screen.getByText("Profilo non disponibile. Contatta il supporto."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("storico-client")).not.toBeInTheDocument();
  });

  it("degrada come searchReceipts, che nella stessa pagina già ritorna { error }", async () => {
    // Era l'incoerenza del finding: `searchReceipts` degrada a items vuoti e
    // `getPlan` accanto lanciava, quindi il throw vinceva comunque.
    mockSearchReceipts.mockResolvedValue({
      error: "boom",
      items: [],
      total: 0,
    });
    mockGetPlanSafe.mockResolvedValue({
      ok: false,
      error:
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
    });

    render(await StoricoPage(pageProps()));

    expect(
      screen.getByText(
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
      ),
    ).toBeInTheDocument();
  });
});

describe("StoricoPage — il fallback non intercetta i redirect", () => {
  it("redirige ancora all'onboarding senza business", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });

    await expect(StoricoPage(pageProps())).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });
});
