import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminPaidUsersSkeleton,
  AdminPaidUsersTable,
  AdminRecentProfilesSkeleton,
  AdminRecentProfilesTable,
  AdminTopMerchantsSkeleton,
  AdminTopMerchantsTables,
  AdminTrialExpiringSkeleton,
  AdminTrialExpiringTable,
} from "./admin-directory-tables";
import type {
  AdminPaidUserRow,
  AdminProfileRow,
  AdminTopMerchants,
  AdminTrialRow,
} from "@/server/admin-directory";

const MERCHANTS: AdminTopMerchants = {
  byReceipts: [
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
  byRevenue: [
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
};

const PROFILES: readonly AdminProfileRow[] = [
  {
    name: "Anna Bianchi",
    email: "anna@example.com",
    createdAt: "2026-08-20T09:00:00.000Z",
  },
];

const TRIALS: readonly AdminTrialRow[] = [
  {
    name: null,
    email: "tri@example.com",
    trialExpiresAt: "2026-08-28T09:00:00.000Z",
  },
];

const PAID: readonly AdminPaidUserRow[] = [
  {
    name: "Luca Verdi",
    email: "luca@example.com",
    plan: "pro",
    planActivatedAt: null,
  },
];

describe("AdminTopMerchantsTables", () => {
  it("rende le due classifiche, che vengono dalla stessa query", () => {
    render(<AdminTopMerchantsTables merchants={MERCHANTS} />);

    expect(
      screen.getByRole("table", { name: /per scontrini/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /per incasso/i }),
    ).toBeInTheDocument();
  });

  it("formatta l'incasso in euro dai centesimi", () => {
    render(<AdminTopMerchantsTables merchants={MERCHANTS} />);

    expect(screen.getByText(/450,00/)).toBeInTheDocument();
    expect(screen.getByText(/9\.?000,00/)).toBeInTheDocument();
  });

  it("mostra un segnaposto dove insegna, titolare o località mancano", () => {
    render(<AdminTopMerchantsTables merchants={MERCHANTS} />);

    // La riga senza insegna né titolare né città resta visibile: l'email basta
    // a identificarla, perderla vanificherebbe la classifica.
    expect(screen.getByText("anon@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("mostra lo stato vuoto quando non c'è nulla da classificare", () => {
    render(
      <AdminTopMerchantsTables merchants={{ byReceipts: [], byRevenue: [] }} />,
    );

    expect(screen.queryAllByRole("table")).toHaveLength(0);
    expect(
      screen.getAllByText("Nessuno scontrino emesso nel periodo."),
    ).toHaveLength(2);
  });
});

describe("AdminTrialExpiringTable", () => {
  it("formatta la scadenza in formato italiano", () => {
    render(<AdminTrialExpiringTable rows={TRIALS} />);

    expect(screen.getByText("28/08/2026")).toBeInTheDocument();
  });

  it("mostra lo stato vuoto quando non c'è nessun trial in scadenza", () => {
    render(<AdminTrialExpiringTable rows={[]} />);

    expect(
      screen.getByText("Nessun trial in scadenza nei prossimi 7 giorni."),
    ).toBeInTheDocument();
  });
});

describe("AdminPaidUsersTable", () => {
  it("formatta la data di attivazione quando è ricostruibile", () => {
    render(
      <AdminPaidUsersTable
        rows={[
          {
            name: "Giulia Neri",
            email: "giulia@example.com",
            plan: "starter",
            planActivatedAt: "2026-02-14T12:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("14/02/2026")).toBeInTheDocument();
  });

  it("mostra un trattino quando la data di attivazione non è ricostruibile", () => {
    render(<AdminPaidUsersTable rows={PAID} />);

    expect(
      screen.getByRole("table", { name: /utenti paganti/i }),
    ).toHaveTextContent("—");
  });

  it("mostra lo stato vuoto quando nessuno paga", () => {
    render(<AdminPaidUsersTable rows={[]} />);

    expect(
      screen.getByText("Nessun utente su un piano a pagamento."),
    ).toBeInTheDocument();
  });
});

describe("AdminRecentProfilesTable", () => {
  it("formatta la data di registrazione in formato italiano", () => {
    render(<AdminRecentProfilesTable rows={PROFILES} />);

    expect(screen.getByText("20/08/2026")).toBeInTheDocument();
  });

  it("mostra lo stato vuoto quando non c'è nessuna registrazione", () => {
    render(<AdminRecentProfilesTable rows={[]} />);

    expect(
      screen.getByText("Nessuna registrazione nel periodo."),
    ).toBeInTheDocument();
  });
});

describe("scheletri delle tabelle", () => {
  /**
   * Ogni skeleton deve portare lo STESSO titolo della sua tabella: è ciò che
   * rende la sostituzione invisibile quando la query risponde. Sono definiti
   * accanto al componente vero proprio per non poter divergere, e questi test
   * lo verificano dall'esterno.
   */
  it.each([
    ["classifiche", <AdminTopMerchantsSkeleton key="m" />, /per scontrini/i],
    ["trial", <AdminTrialExpiringSkeleton key="t" />, /trial in scadenza/i],
    ["paganti", <AdminPaidUsersSkeleton key="p" />, /utenti paganti/i],
    [
      "registrati",
      <AdminRecentProfilesSkeleton key="r" />,
      /registrati di recente/i,
    ],
  ])(
    "lo skeleton di %s mostra il titolo della tabella vera",
    (_, node, title) => {
      render(node);

      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    },
  );

  it("non rende nessuna tabella finché i dati non arrivano", () => {
    render(<AdminTopMerchantsSkeleton />);

    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });

  it("annuncia il caricamento a chi usa uno screen reader", () => {
    render(<AdminTrialExpiringSkeleton />);

    expect(
      screen.getByText(/caricamento di trial in scadenza in corso/i),
    ).toBeInTheDocument();
  });
});
