// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminKpis } from "@/server/admin-metrics";

const { mockGetAdminKpis } = vi.hoisted(() => ({
  mockGetAdminKpis: vi.fn(),
}));

vi.mock("@/server/admin-metrics", () => ({
  getAdminKpis: (...args: unknown[]) => mockGetAdminKpis(...args),
}));

import AdminPage from "./page";

const KPIS: AdminKpis = {
  usersTotal: 100,
  usersInRange: 4,
  usersSparkline: [],
  receiptsTotal: 500,
  receiptsInRange: 20,
  receiptsSparkline: [],
  revenueCentsTotal: 100000,
  revenueCentsInRange: 5000,
  revenueSparkline: [],
  voidedInRange: 1,
  trialsActive: 2,
  trialConversionRate: 0.5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminKpis.mockResolvedValue({ kpis: KPIS });
});

describe("AdminPage", () => {
  it("usa il range 30d quando l'URL non ne specifica uno", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(mockGetAdminKpis).toHaveBeenCalledWith("30d");
  });

  it("onora un ?range= valido", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({ range: "7d" }) }));

    expect(mockGetAdminKpis).toHaveBeenCalledWith("7d");
  });

  it("ricade sul default su un ?range= non valido, senza lanciare", async () => {
    render(
      await AdminPage({
        searchParams: Promise.resolve({ range: "'; DROP TABLE profiles;--" }),
      }),
    );

    expect(mockGetAdminKpis).toHaveBeenCalledWith("30d");
  });

  it("mostra i KPI quando la lettura riesce", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Nuovi utenti")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("mostra un avviso inline invece di card a zero se il DB fallisce", async () => {
    mockGetAdminKpis.mockResolvedValue({ error: "Impossibile caricare." });

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossibile caricare.",
    );
    expect(screen.queryByText("Nuovi utenti")).not.toBeInTheDocument();
  });

  it("tiene il selettore di periodo visibile anche in errore", async () => {
    mockGetAdminKpis.mockResolvedValue({ error: "Impossibile caricare." });

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "7 giorni" })).toBeInTheDocument();
  });
});
