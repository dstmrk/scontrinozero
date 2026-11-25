// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAdminFunnel,
  mockGetAdminSignups,
  mockGetAdminStalePendingDocuments,
  mockGetAdminTrialActive,
  mockGetAdminTrialExpiring,
} = vi.hoisted(() => ({
  mockGetAdminFunnel: vi.fn(),
  mockGetAdminSignups: vi.fn(),
  mockGetAdminStalePendingDocuments: vi.fn(),
  mockGetAdminTrialActive: vi.fn(),
  mockGetAdminTrialExpiring: vi.fn(),
}));

vi.mock("@/server/admin-metrics", () => ({
  getAdminFunnel: (...args: unknown[]) => mockGetAdminFunnel(...args),
}));

vi.mock("@/server/admin-directory", () => ({
  getAdminSignups: (...args: unknown[]) => mockGetAdminSignups(...args),
  getAdminTrialExpiring: (...args: unknown[]) =>
    mockGetAdminTrialExpiring(...args),
  getAdminTrialActive: (...args: unknown[]) => mockGetAdminTrialActive(...args),
  getAdminStalePendingDocuments: (...args: unknown[]) =>
    mockGetAdminStalePendingDocuments(...args),
}));

import {
  AdminFunnelSection,
  AdminSignupsSection,
  AdminStalePendingDocumentsSection,
  AdminTrialActiveKpiSection,
  AdminTrialActiveMerchantsSection,
  AdminTrialExpiringSection,
} from "./sections";

const NO_METHODS = { fisconline: 0, cie: 0, spid: 0 };

const MERCHANT = {
  businessId: "b1",
  businessName: "Bar Centrale",
  ownerName: null,
  location: null,
  email: "mario@example.com",
  receipts: 12,
  revenueCents: 45000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminFunnel.mockResolvedValue({
    funnel: {
      registered: 5,
      onboarded: { total: 3, methods: NO_METHODS },
      issuedReceipts: { total: 1, methods: NO_METHODS },
      paying: { total: 0, methods: NO_METHODS },
      payingWithoutReceipts: 0,
    },
  });
  mockGetAdminSignups.mockResolvedValue({
    signups: {
      counts: { total: 0, recent: 0, weeks: 0 },
      inRange: [],
      earlier: [],
    },
  });
  mockGetAdminTrialExpiring.mockResolvedValue({ rows: [] });
  mockGetAdminTrialActive.mockResolvedValue({
    trials: { active: 4, withReceipts: 1, merchants: [MERCHANT] },
  });
  mockGetAdminStalePendingDocuments.mockResolvedValue({ rows: [] });
});

describe("propagazione del periodo", () => {
  it("passa il range ai registrati, l'unica sezione che lo usa", async () => {
    await AdminSignupsSection({ range: "90d" });

    expect(mockGetAdminSignups).toHaveBeenCalledWith("90d");
  });

  it("non passa nessun range alle letture ancorate ad adesso", async () => {
    await AdminFunnelSection();
    await AdminTrialActiveKpiSection();
    await AdminTrialExpiringSection();
    await AdminStalePendingDocumentsSection();

    expect(mockGetAdminFunnel).toHaveBeenCalledWith();
    expect(mockGetAdminTrialActive).toHaveBeenCalledWith();
    expect(mockGetAdminTrialExpiring).toHaveBeenCalledWith();
    expect(mockGetAdminStalePendingDocuments).toHaveBeenCalledWith();
  });
});

describe("contenuto delle sezioni", () => {
  it("rende il funnel di sempre", async () => {
    render(await AdminFunnelSection());

    expect(screen.getByText("Funnel · dall'inizio")).toBeInTheDocument();
  });

  it("KPI e tabella dei trial attivi mostrano la stessa lettura", async () => {
    const kpi = render(await AdminTrialActiveKpiSection());
    expect(screen.getByText("Trial attivi")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    kpi.unmount();

    render(await AdminTrialActiveMerchantsSection());
    expect(screen.getByText("Trial attivi con scontrini")).toBeInTheDocument();
    expect(screen.getByText("Bar Centrale")).toBeInTheDocument();
  });

  it("rende i trial in scadenza", async () => {
    render(await AdminTrialExpiringSection());

    expect(screen.getByText("Trial in scadenza")).toBeInTheDocument();
  });

  it("rende registrati e onboarding fermi in una tabella, con i conteggi", async () => {
    mockGetAdminSignups.mockResolvedValue({
      signups: {
        counts: { total: 3, recent: 1, weeks: 2 },
        inRange: [],
        earlier: [
          {
            name: "Mario Rossi",
            email: "fermo@example.com",
            registeredAt: "2026-05-19T08:00:00.000Z",
            status: "stalled",
            outcome: "auth_error",
            attempts: 3,
            stalledSince: "2026-05-19T08:00:00.000Z",
          },
        ],
      },
    });

    render(await AdminSignupsSection({ range: "7d" }));

    expect(
      screen.getByText("Registrati e onboarding fermi"),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 fermi in totale/)).toBeInTheDocument();
    expect(screen.getByText("Credenziali rifiutate")).toBeInTheDocument();
  });

  it("rende i documenti in sospeso anche quando non c'è nulla (PR #904)", async () => {
    render(await AdminStalePendingDocumentsSection());

    expect(screen.getByText("Documenti in sospeso")).toBeInTheDocument();
    expect(
      screen.getByText("Nessun documento in sospeso oltre la soglia."),
    ).toBeInTheDocument();
  });

  it("mostra esercente dei documenti in sospeso quando ce ne sono", async () => {
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
});

describe("degrado indipendente", () => {
  it.each([
    ["funnel", mockGetAdminFunnel, () => AdminFunnelSection()],
    ["trial-kpi", mockGetAdminTrialActive, () => AdminTrialActiveKpiSection()],
    [
      "trial-esercenti",
      mockGetAdminTrialActive,
      () => AdminTrialActiveMerchantsSection(),
    ],
    ["trial", mockGetAdminTrialExpiring, () => AdminTrialExpiringSection()],
    [
      "registrati",
      mockGetAdminSignups,
      () => AdminSignupsSection({ range: "7d" }),
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
    mockGetAdminFunnel.mockResolvedValue({ error: "Funnel KO." });

    const rotta = render(await AdminFunnelSection());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rotta.unmount();

    render(await AdminTrialActiveKpiSection());
    expect(screen.getByText("Trial attivi")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fa occupare all'avviso del funnel le stesse due colonne della card", async () => {
    mockGetAdminFunnel.mockResolvedValue({ error: "KO." });

    render(await AdminFunnelSection());

    expect(screen.getByRole("alert")).toHaveClass("lg:col-span-2");
  });
});
