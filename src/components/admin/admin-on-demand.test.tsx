import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLoadAdminUserKpis,
  mockLoadAdminDocumentKpis,
  mockLoadAdminPaidUsers,
  mockLoadAdminTopMerchants,
} = vi.hoisted(() => ({
  mockLoadAdminUserKpis: vi.fn(),
  mockLoadAdminDocumentKpis: vi.fn(),
  mockLoadAdminPaidUsers: vi.fn(),
  mockLoadAdminTopMerchants: vi.fn(),
}));

vi.mock("@/server/admin-actions", () => ({
  loadAdminUserKpis: (...args: unknown[]) => mockLoadAdminUserKpis(...args),
  loadAdminDocumentKpis: (...args: unknown[]) =>
    mockLoadAdminDocumentKpis(...args),
  loadAdminPaidUsers: (...args: unknown[]) => mockLoadAdminPaidUsers(...args),
  loadAdminTopMerchants: (...args: unknown[]) =>
    mockLoadAdminTopMerchants(...args),
}));

import {
  AdminDocumentKpisOnDemand,
  AdminPaidUsersOnDemand,
  AdminTopMerchantsOnDemand,
  AdminUserKpisOnDemand,
} from "./admin-on-demand";

const USER_KPIS = {
  usersTotal: 85,
  usersInRange: 5,
  usersSparkline: [{ date: "2026-11-25", value: 5 }],
};

const DOCUMENT_KPIS = {
  receiptsTotal: 2344,
  receiptsInRange: 218,
  receiptsSparkline: [],
  revenueCentsTotal: 38310685,
  revenueCentsInRange: 1897938,
  revenueSparkline: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadAdminUserKpis.mockResolvedValue({ kpis: USER_KPIS });
  mockLoadAdminDocumentKpis.mockResolvedValue({ kpis: DOCUMENT_KPIS });
  mockLoadAdminPaidUsers.mockResolvedValue({
    rows: [
      {
        name: "Anna Bianchi",
        email: "anna@example.com",
        plan: "pro",
        planActivatedAt: null,
      },
    ],
  });
  mockLoadAdminTopMerchants.mockResolvedValue({
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
});

function clickLoad(): void {
  fireEvent.click(screen.getByRole("button", { name: "Carica" }));
}

describe("card su richiesta", () => {
  it("non legge nulla finché non si preme Carica", () => {
    render(<AdminUserKpisOnDemand range="7d" />);

    expect(screen.getByText("Nuovi utenti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carica" })).toBeInTheDocument();
    expect(mockLoadAdminUserKpis).not.toHaveBeenCalled();
  });

  it("al click chiama l'action col periodo e mostra la card vera", async () => {
    render(<AdminUserKpisOnDemand range="30d" />);

    clickLoad();

    expect(await screen.findByText("85 in totale")).toBeInTheDocument();
    expect(mockLoadAdminUserKpis).toHaveBeenCalledWith("30d");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mostra uno scheletro mentre la lettura è in volo", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockLoadAdminUserKpis.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<AdminUserKpisOnDemand range="7d" />);

    clickLoad();

    expect(
      await screen.findByText("Caricamento di nuovi utenti in corso"),
    ).toBeInTheDocument();
    resolve({ kpis: USER_KPIS });
    expect(await screen.findByText("85 in totale")).toBeInTheDocument();
  });

  it("su { error } mostra l'avviso e un pulsante per riprovare", async () => {
    mockLoadAdminUserKpis.mockResolvedValueOnce({ error: "Lettura caduta." });
    render(<AdminUserKpisOnDemand range="7d" />);

    clickLoad();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lettura caduta.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("85 in totale")).toBeInTheDocument();
    expect(mockLoadAdminUserKpis).toHaveBeenCalledTimes(2);
  });

  it("se l'action lancia (rete, deploy) degrada a un avviso invece di rompere", async () => {
    mockLoadAdminUserKpis.mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<AdminUserKpisOnDemand range="7d" />);

    clickLoad();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile caricare questa sezione.",
    );
  });
});

describe("le quattro card", () => {
  it("scontrini e incasso: due card affiancate su due celle", async () => {
    const { container } = render(<AdminDocumentKpisOnDemand range="90d" />);

    clickLoad();

    expect(await screen.findByText("Incasso")).toBeInTheDocument();
    expect(screen.getByText("Scontrini")).toBeInTheDocument();
    expect(mockLoadAdminDocumentKpis).toHaveBeenCalledWith("90d");
    expect(container.firstElementChild).toHaveClass("sm:col-span-2");
  });

  it("utenti paganti: la tabella prende tutta la riga", async () => {
    const { container } = render(<AdminPaidUsersOnDemand />);

    clickLoad();

    expect(await screen.findByText("anna@example.com")).toBeInTheDocument();
    expect(mockLoadAdminPaidUsers).toHaveBeenCalledWith();
    expect(container.firstElementChild).toHaveClass("col-span-full");
  });

  it("top esercenti: le due classifiche col periodo", async () => {
    render(<AdminTopMerchantsOnDemand range="ytd" />);

    clickLoad();

    expect(await screen.findByText("Bar Centrale")).toBeInTheDocument();
    expect(mockLoadAdminTopMerchants).toHaveBeenCalledWith("ytd");
  });
});
