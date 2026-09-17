// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminDocumentKpis, AdminUserKpis } from "@/server/admin-metrics";

const {
  mockGetAdminDocumentKpis,
  mockGetAdminPaidUsers,
  mockGetAdminRecentProfiles,
  mockGetAdminStalePendingDocuments,
  mockGetAdminStalledOnboarding,
  mockGetAdminTopMerchants,
  mockGetAdminTrialActiveMerchants,
  mockGetAdminTrialExpiring,
  mockGetAdminTrialFunnel,
  mockGetAdminUserKpis,
} = vi.hoisted(() => ({
  mockGetAdminDocumentKpis: vi.fn(),
  mockGetAdminPaidUsers: vi.fn(),
  mockGetAdminRecentProfiles: vi.fn(),
  mockGetAdminStalePendingDocuments: vi.fn(),
  mockGetAdminStalledOnboarding: vi.fn(),
  mockGetAdminTopMerchants: vi.fn(),
  mockGetAdminTrialActiveMerchants: vi.fn(),
  mockGetAdminTrialExpiring: vi.fn(),
  mockGetAdminTrialFunnel: vi.fn(),
  mockGetAdminUserKpis: vi.fn(),
}));

vi.mock("@/server/admin-metrics", () => ({
  getAdminUserKpis: (...args: unknown[]) => mockGetAdminUserKpis(...args),
  getAdminDocumentKpis: (...args: unknown[]) =>
    mockGetAdminDocumentKpis(...args),
  getAdminTrialFunnel: (...args: unknown[]) => mockGetAdminTrialFunnel(...args),
}));

vi.mock("@/server/admin-directory", () => ({
  getAdminTopMerchants: (...args: unknown[]) =>
    mockGetAdminTopMerchants(...args),
  getAdminRecentProfiles: (...args: unknown[]) =>
    mockGetAdminRecentProfiles(...args),
  getAdminTrialExpiring: (...args: unknown[]) =>
    mockGetAdminTrialExpiring(...args),
  getAdminTrialActiveMerchants: (...args: unknown[]) =>
    mockGetAdminTrialActiveMerchants(...args),
  getAdminPaidUsers: (...args: unknown[]) => mockGetAdminPaidUsers(...args),
  getAdminStalledOnboarding: (...args: unknown[]) =>
    mockGetAdminStalledOnboarding(...args),
  getAdminStalePendingDocuments: (...args: unknown[]) =>
    mockGetAdminStalePendingDocuments(...args),
}));

import {
  AdminDocumentKpisSection,
  AdminPaidUsersSection,
  AdminRecentProfilesSection,
  AdminStalePendingDocumentsSection,
  AdminStalledOnboardingSection,
  AdminTopMerchantsSection,
  AdminTrialActiveMerchantsSection,
  AdminTrialExpiringSection,
  AdminTrialFunnelSection,
  AdminUserKpisSection,
} from "./sections";

const USER_KPIS: AdminUserKpis = {
  usersTotal: 100,
  usersInRange: 4,
  usersSparkline: [],
  trialsOnboarded: 2,
};

const DOCUMENT_KPIS: AdminDocumentKpis = {
  receiptsTotal: 500,
  receiptsInRange: 20,
  receiptsSparkline: [],
  revenueCentsTotal: 100000,
  revenueCentsInRange: 5000,
  revenueSparkline: [],
  fisconlineUsers: 8,
  cieUsers: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminUserKpis.mockResolvedValue({ kpis: USER_KPIS });
  mockGetAdminDocumentKpis.mockResolvedValue({ kpis: DOCUMENT_KPIS });
  mockGetAdminTrialFunnel.mockResolvedValue({
    funnel: { registered: 5, onboarded: 3, issuedReceipts: 1 },
  });
  mockGetAdminTopMerchants.mockResolvedValue({
    merchants: { byReceipts: [], byRevenue: [] },
  });
  mockGetAdminRecentProfiles.mockResolvedValue({ rows: [] });
  mockGetAdminTrialExpiring.mockResolvedValue({ rows: [] });
  mockGetAdminTrialActiveMerchants.mockResolvedValue({ merchants: [] });
  mockGetAdminPaidUsers.mockResolvedValue({ rows: [] });
  mockGetAdminStalePendingDocuments.mockResolvedValue({ rows: [] });
  mockGetAdminStalledOnboarding.mockResolvedValue({
    stalled: {
      counts: { total: 0, recent: 0, weeks: 0, stale: 0 },
      rows: [],
    },
  });
});

describe("propagazione del periodo", () => {
  it("passa il range alle letture che lo usano", async () => {
    await AdminUserKpisSection({ range: "90d" });
    await AdminTrialFunnelSection({ range: "90d" });
    await AdminDocumentKpisSection({ range: "90d" });
    await AdminTopMerchantsSection({ range: "90d" });
    await AdminRecentProfilesSection({ range: "90d" });

    expect(mockGetAdminUserKpis).toHaveBeenCalledWith("90d");
    expect(mockGetAdminTrialFunnel).toHaveBeenCalledWith("90d");
    expect(mockGetAdminDocumentKpis).toHaveBeenCalledWith("90d");
    expect(mockGetAdminTopMerchants).toHaveBeenCalledWith("90d");
    expect(mockGetAdminRecentProfiles).toHaveBeenCalledWith("90d");
  });

  it("non passa nessun range alle letture ancorate ad adesso", async () => {
    await AdminTrialExpiringSection();
    await AdminTrialActiveMerchantsSection();
    await AdminPaidUsersSection();
    await AdminStalledOnboardingSection();
    await AdminStalePendingDocumentsSection();

    expect(mockGetAdminTrialExpiring).toHaveBeenCalledWith();
    expect(mockGetAdminTrialActiveMerchants).toHaveBeenCalledWith();
    expect(mockGetAdminPaidUsers).toHaveBeenCalledWith();
    // Un onboarding arenato a maggio deve comparire anche col periodo a 7
    // giorni: filtrarlo sul range nasconderebbe proprio i casi che contano.
    expect(mockGetAdminStalledOnboarding).toHaveBeenCalledWith();
    expect(mockGetAdminStalePendingDocuments).toHaveBeenCalledWith();
  });
});

describe("contenuto delle sezioni", () => {
  it("rende le card utenti", async () => {
    render(await AdminUserKpisSection({ range: "7d" }));

    expect(screen.getByText("Nuovi utenti")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("rende il funnel trial", async () => {
    render(await AdminTrialFunnelSection({ range: "7d" }));

    expect(screen.getByText("Funnel trial (periodo)")).toBeInTheDocument();
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

  it("rende le tabelle-elenco", async () => {
    const trials = render(await AdminTrialExpiringSection());
    expect(screen.getByText("Trial in scadenza")).toBeInTheDocument();
    trials.unmount();

    const trialMerchants = render(await AdminTrialActiveMerchantsSection());
    expect(screen.getByText("Trial attivi con scontrini")).toBeInTheDocument();
    trialMerchants.unmount();

    const paid = render(await AdminPaidUsersSection());
    expect(screen.getByText("Utenti paganti")).toBeInTheDocument();
    paid.unmount();

    const stalePending = render(await AdminStalePendingDocumentsSection());
    expect(screen.getByText("Documenti in sospeso")).toBeInTheDocument();
    stalePending.unmount();

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
      "funnel",
      mockGetAdminTrialFunnel,
      () => AdminTrialFunnelSection({ range: "7d" }),
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
    [
      "trial-esercenti",
      mockGetAdminTrialActiveMerchants,
      () => AdminTrialActiveMerchantsSection(),
    ],
    ["paganti", mockGetAdminPaidUsers, () => AdminPaidUsersSection()],
    [
      "registrati",
      mockGetAdminRecentProfiles,
      () => AdminRecentProfilesSection({ range: "7d" }),
    ],
    [
      "documenti-in-sospeso",
      mockGetAdminStalePendingDocuments,
      () => AdminStalePendingDocumentsSection(),
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
    // Senza `col-span-full` l'avviso starebbe in una sola cella e le card
    // mancanti lascerebbero dei buchi nella griglia.
    mockGetAdminUserKpis.mockResolvedValue({ error: "KO." });

    render(await AdminUserKpisSection({ range: "7d" }));

    expect(screen.getByRole("alert")).toHaveClass("col-span-full");
  });
});

describe("documenti in sospeso (REVIEW.md #103)", () => {
  it("rende la tabella anche quando non c'è nulla in sospeso", async () => {
    mockGetAdminStalePendingDocuments.mockResolvedValue({ rows: [] });

    render(await AdminStalePendingDocumentsSection());

    expect(screen.getByText("Documenti in sospeso")).toBeInTheDocument();
    expect(
      screen.getByText("Nessun documento in sospeso oltre la soglia."),
    ).toBeInTheDocument();
  });

  it("mostra esercente, data e importo quando ce ne sono", async () => {
    mockGetAdminStalePendingDocuments.mockResolvedValue({
      rows: [
        {
          businessName: "Bar Centrale",
          createdAt: "2026-09-17T08:00:00.000Z",
          amountCents: 1250,
        },
      ],
    });

    render(await AdminStalePendingDocumentsSection());

    expect(screen.getByText("Bar Centrale")).toBeInTheDocument();
  });

  it("mostra l'avviso di errore quando la lettura degrada", async () => {
    mockGetAdminStalePendingDocuments.mockResolvedValue({
      error: "Query caduta",
    });

    render(await AdminStalePendingDocumentsSection());

    expect(screen.getByRole("alert")).toHaveTextContent("Query caduta");
  });
});

describe("onboarding fermi (REVIEW.md #107)", () => {
  it("rende la tabella con i conteggi per età", async () => {
    mockGetAdminStalledOnboarding.mockResolvedValue({
      stalled: {
        counts: { total: 10, recent: 2, weeks: 3, stale: 5 },
        rows: [
          {
            name: "Mario Rossi",
            email: "fermo@example.com",
            outcome: "auth_error",
            attempts: 3,
            createdAt: "2026-05-19T08:00:00.000Z",
            lastVerifyAt: "2026-05-19T08:04:00.000Z",
          },
        ],
      },
    });

    render(await AdminStalledOnboardingSection());

    expect(screen.getByText("Onboarding fermi")).toBeInTheDocument();
    expect(screen.getByText(/10 fermi in totale/)).toBeInTheDocument();
    expect(screen.getByText("fermo@example.com")).toBeInTheDocument();
    expect(screen.getByText("Credenziali rifiutate")).toBeInTheDocument();
  });

  it("mostra l'avviso di errore quando la lettura degrada", async () => {
    mockGetAdminStalledOnboarding.mockResolvedValue({ error: "Query caduta" });

    render(await AdminStalledOnboardingSection());

    expect(screen.getByRole("alert")).toHaveTextContent("Query caduta");
  });
});
