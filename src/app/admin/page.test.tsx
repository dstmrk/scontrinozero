// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminKpis } from "@/server/admin-metrics";

const { mockGetAdminKpis, mockGetAdminDirectory } = vi.hoisted(() => ({
  mockGetAdminKpis: vi.fn(),
  mockGetAdminDirectory: vi.fn(),
}));

vi.mock("@/server/admin-metrics", () => ({
  getAdminKpis: (...args: unknown[]) => mockGetAdminKpis(...args),
}));

vi.mock("@/server/admin-directory", () => ({
  getAdminDirectory: (...args: unknown[]) => mockGetAdminDirectory(...args),
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

const DIRECTORY = {
  topByReceipts: [],
  topByRevenue: [],
  recentProfiles: [],
  trialExpiring: [],
  paidUsers: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminKpis.mockResolvedValue({ kpis: KPIS });
  mockGetAdminDirectory.mockResolvedValue({ directory: DIRECTORY });
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

  it("passa il range anche alla lettura degli elenchi", async () => {
    render(
      await AdminPage({ searchParams: Promise.resolve({ range: "90d" }) }),
    );

    expect(mockGetAdminDirectory).toHaveBeenCalledWith("90d");
  });

  it("rende gli elenchi accanto ai KPI", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Top esercenti per scontrini")).toBeInTheDocument();
  });

  it("tiene i KPI se falliscono solo gli elenchi", async () => {
    mockGetAdminDirectory.mockResolvedValue({ error: "Elenchi non caricati." });

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Nuovi utenti")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Elenchi non caricati.",
    );
  });

  it("tiene gli elenchi se falliscono solo i KPI", async () => {
    mockGetAdminKpis.mockResolvedValue({ error: "KPI non caricati." });

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Top esercenti per scontrini")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("KPI non caricati.");
  });

  it("tiene il selettore di periodo visibile anche in errore", async () => {
    mockGetAdminKpis.mockResolvedValue({ error: "Impossibile caricare." });

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "7 giorni" })).toBeInTheDocument();
  });
});
