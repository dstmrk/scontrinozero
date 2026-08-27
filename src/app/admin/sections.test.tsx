// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminDocumentKpis, AdminUserKpis } from "@/server/admin-metrics";

const {
  mockGetAdminDocumentKpis,
  mockGetAdminPaidUsers,
  mockGetAdminRecentProfiles,
  mockGetAdminTopMerchants,
  mockGetAdminTrialExpiring,
  mockGetAdminUserKpis,
} = vi.hoisted(() => ({
  mockGetAdminDocumentKpis: vi.fn(),
  mockGetAdminPaidUsers: vi.fn(),
  mockGetAdminRecentProfiles: vi.fn(),
  mockGetAdminTopMerchants: vi.fn(),
  mockGetAdminTrialExpiring: vi.fn(),
  mockGetAdminUserKpis: vi.fn(),
}));

vi.mock("@/server/admin-metrics", () => ({
  getAdminUserKpis: (...args: unknown[]) => mockGetAdminUserKpis(...args),
  getAdminDocumentKpis: (...args: unknown[]) =>
    mockGetAdminDocumentKpis(...args),
}));

vi.mock("@/server/admin-directory", () => ({
  getAdminTopMerchants: (...args: unknown[]) =>
    mockGetAdminTopMerchants(...args),
  getAdminRecentProfiles: (...args: unknown[]) =>
    mockGetAdminRecentProfiles(...args),
  getAdminTrialExpiring: (...args: unknown[]) =>
    mockGetAdminTrialExpiring(...args),
  getAdminPaidUsers: (...args: unknown[]) => mockGetAdminPaidUsers(...args),
}));

import {
  AdminDocumentKpisSection,
  AdminPaidUsersSection,
  AdminRecentProfilesSection,
  AdminTopMerchantsSection,
  AdminTrialExpiringSection,
  AdminUserKpisSection,
} from "./sections";

const USER_KPIS: AdminUserKpis = {
  usersTotal: 100,
  usersInRange: 4,
  usersSparkline: [],
  trialsActive: 2,
  trialConversionRate: 0.5,
};

const DOCUMENT_KPIS: AdminDocumentKpis = {
  receiptsTotal: 500,
  receiptsInRange: 20,
  receiptsSparkline: [],
  revenueCentsTotal: 100000,
  revenueCentsInRange: 5000,
  revenueSparkline: [],
  voidedInRange: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminUserKpis.mockResolvedValue({ kpis: USER_KPIS });
  mockGetAdminDocumentKpis.mockResolvedValue({ kpis: DOCUMENT_KPIS });
  mockGetAdminTopMerchants.mockResolvedValue({
    merchants: { byReceipts: [], byRevenue: [] },
  });
  mockGetAdminRecentProfiles.mockResolvedValue({ rows: [] });
  mockGetAdminTrialExpiring.mockResolvedValue({ rows: [] });
  mockGetAdminPaidUsers.mockResolvedValue({ rows: [] });
});

describe("propagazione del periodo", () => {
  it("passa il range alle quattro letture che lo usano", async () => {
    await AdminUserKpisSection({ range: "90d" });
    await AdminDocumentKpisSection({ range: "90d" });
    await AdminTopMerchantsSection({ range: "90d" });
    await AdminRecentProfilesSection({ range: "90d" });

    expect(mockGetAdminUserKpis).toHaveBeenCalledWith("90d");
    expect(mockGetAdminDocumentKpis).toHaveBeenCalledWith("90d");
    expect(mockGetAdminTopMerchants).toHaveBeenCalledWith("90d");
    expect(mockGetAdminRecentProfiles).toHaveBeenCalledWith("90d");
  });

  it("non passa nessun range alle due letture ancorate ad adesso", async () => {
    await AdminTrialExpiringSection();
    await AdminPaidUsersSection();

    expect(mockGetAdminTrialExpiring).toHaveBeenCalledWith();
    expect(mockGetAdminPaidUsers).toHaveBeenCalledWith();
  });
});

describe("contenuto delle sezioni", () => {
  it("rende le card utenti", async () => {
    render(await AdminUserKpisSection({ range: "7d" }));

    expect(screen.getByText("Nuovi utenti")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("rende le card scontrini", async () => {
    render(await AdminDocumentKpisSection({ range: "7d" }));

    expect(screen.getByText("Scontrini")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("rende le classifiche esercenti", async () => {
    mockGetAdminTopMerchants.mockResolvedValue({
      merchants: {
        byReceipts: [
          {
            businessId: "b1",
            businessName: "Bar Centrale",
            ownerName: null,
            location: null,
            email: "mario@example.com",
            receipts: 12,
            revenueCents: 45000,
          },
        ],
        byRevenue: [],
      },
    });

    render(await AdminTopMerchantsSection({ range: "7d" }));

    expect(screen.getByText("Bar Centrale")).toBeInTheDocument();
  });

  it("rende le tre tabelle-elenco", async () => {
    const trials = render(await AdminTrialExpiringSection());
    expect(screen.getByText("Trial in scadenza")).toBeInTheDocument();
    trials.unmount();

    const paid = render(await AdminPaidUsersSection());
    expect(screen.getByText("Utenti paganti")).toBeInTheDocument();
    paid.unmount();

    render(await AdminRecentProfilesSection({ range: "7d" }));
    expect(screen.getByText("Registrati di recente")).toBeInTheDocument();
  });
});

describe("degrado indipendente", () => {
  it.each([
    [
      "utenti",
      mockGetAdminUserKpis,
      () => AdminUserKpisSection({ range: "7d" }),
    ],
    [
      "scontrini",
      mockGetAdminDocumentKpis,
      () => AdminDocumentKpisSection({ range: "7d" }),
    ],
    [
      "classifiche",
      mockGetAdminTopMerchants,
      () => AdminTopMerchantsSection({ range: "7d" }),
    ],
    ["trial", mockGetAdminTrialExpiring, () => AdminTrialExpiringSection()],
    ["paganti", mockGetAdminPaidUsers, () => AdminPaidUsersSection()],
    [
      "registrati",
      mockGetAdminRecentProfiles,
      () => AdminRecentProfilesSection({ range: "7d" }),
    ],
  ])(
    "la sezione %s mostra il proprio avviso invece del contenuto",
    async (_, read, renderSection) => {
      read.mockResolvedValue({ error: "Lettura caduta." });

      render(await renderSection());

      expect(screen.getByRole("alert")).toHaveTextContent("Lettura caduta.");
    },
  );

  it("una sezione caduta non porta via le altre", async () => {
    // Il punto dell'intero lavoro: prima KPI ed elenchi erano due blocchi e un
    // fallimento ne spegneva metà pannello. Ora l'avviso resta dentro il suo.
    mockGetAdminDocumentKpis.mockResolvedValue({ error: "Scontrini KO." });

    const rotta = render(await AdminDocumentKpisSection({ range: "7d" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rotta.unmount();

    render(await AdminUserKpisSection({ range: "7d" }));
    expect(screen.getByText("Nuovi utenti")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fa occupare all'avviso dei KPI tutta la riga della griglia", async () => {
    // Senza `col-span-full` l'avviso starebbe in una sola cella e le due card
    // mancanti lascerebbero due buchi nella griglia.
    mockGetAdminUserKpis.mockResolvedValue({ error: "KO." });

    render(await AdminUserKpisSection({ range: "7d" }));

    expect(screen.getByRole("alert")).toHaveClass("col-span-full");
  });
});
