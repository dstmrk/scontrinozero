import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminDirectoryTables } from "./admin-directory-tables";
import type { AdminDirectory } from "@/server/admin-directory";

const EMPTY: AdminDirectory = {
  topByReceipts: [],
  topByRevenue: [],
  recentProfiles: [],
  trialExpiring: [],
  paidUsers: [],
};

const FULL: AdminDirectory = {
  topByReceipts: [
    {
      businessId: "b1",
      businessName: "Bar Centrale",
      ownerName: "Mario Rossi",
      location: "Milano (MI)",
      email: "mario@example.com",
      receipts: 12,
      revenueCents: 45000,
    },
  ],
  topByRevenue: [
    {
      businessId: "b2",
      businessName: null,
      ownerName: null,
      location: null,
      email: "anon@example.com",
      receipts: 3,
      revenueCents: 900000,
    },
  ],
  recentProfiles: [
    {
      name: "Anna Bianchi",
      email: "anna@example.com",
      createdAt: "2026-08-20T09:00:00.000Z",
    },
  ],
  trialExpiring: [
    {
      name: null,
      email: "tri@example.com",
      trialExpiresAt: "2026-08-28T09:00:00.000Z",
    },
  ],
  paidUsers: [
    {
      name: "Luca Verdi",
      email: "luca@example.com",
      plan: "pro",
      planActivatedAt: null,
    },
  ],
};

describe("AdminDirectoryTables", () => {
  it("rende le cinque tabelle del pannello", () => {
    render(<AdminDirectoryTables directory={FULL} />);

    expect(
      screen.getByRole("table", { name: /per scontrini/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /per incasso/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /registrati di recente/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /trial in scadenza/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /utenti paganti/i }),
    ).toBeInTheDocument();
  });

  it("formatta l'incasso degli esercenti in euro dai centesimi", () => {
    render(<AdminDirectoryTables directory={FULL} />);

    expect(screen.getByText(/450,00/)).toBeInTheDocument();
    expect(screen.getByText(/9\.?000,00/)).toBeInTheDocument();
  });

  it("mostra un segnaposto dove nome, insegna o località mancano", () => {
    render(<AdminDirectoryTables directory={FULL} />);

    // La riga senza insegna né titolare né città resta visibile: l'email basta
    // a identificarla, perderla vanificherebbe la classifica.
    expect(screen.getByText("anon@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("formatta le date in formato italiano", () => {
    render(<AdminDirectoryTables directory={FULL} />);

    expect(screen.getByText("20/08/2026")).toBeInTheDocument();
    expect(screen.getByText("28/08/2026")).toBeInTheDocument();
  });

  it("formatta la data di attivazione quando è ricostruibile", () => {
    render(
      <AdminDirectoryTables
        directory={{
          ...FULL,
          paidUsers: [
            {
              name: "Giulia Neri",
              email: "giulia@example.com",
              plan: "starter",
              planActivatedAt: "2026-02-14T12:00:00.000Z",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("14/02/2026")).toBeInTheDocument();
  });

  it("mostra un trattino quando la data di attivazione non è ricostruibile", () => {
    render(<AdminDirectoryTables directory={FULL} />);

    expect(
      screen.getByRole("table", { name: /utenti paganti/i }),
    ).toHaveTextContent("—");
  });

  it("mostra gli stati vuoti quando non c'è nulla da elencare", () => {
    render(<AdminDirectoryTables directory={EMPTY} />);

    expect(screen.queryAllByRole("table")).toHaveLength(0);
    expect(
      screen.getByText("Nessun trial in scadenza nei prossimi 7 giorni."),
    ).toBeInTheDocument();
  });
});
