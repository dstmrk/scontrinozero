import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminPaidUsersSkeleton,
  AdminPaidUsersTable,
  AdminSignupsSkeleton,
  AdminSignupsTable,
  AdminStalePendingDocumentsSkeleton,
  AdminStalePendingDocumentsTable,
  AdminTopMerchantsSkeleton,
  AdminTopMerchantsTables,
  AdminTrialActiveMerchantsSkeleton,
  AdminTrialActiveMerchantsTable,
  AdminTrialExpiringSkeleton,
  AdminTrialExpiringTable,
} from "./admin-directory-tables";
import type {
  AdminMerchant,
  AdminPaidUserRow,
  AdminSignupRow,
  AdminSignups,
  AdminStalePendingDocumentRow,
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

  it("mostra i giorni restanti per un trial non ancora scaduto", () => {
    render(
      <AdminTrialExpiringTable
        rows={TRIALS}
        now={new Date("2026-08-25T09:00:00.000Z")}
      />,
    );

    expect(screen.getByText("restano 3 giorni")).toBeInTheDocument();
  });

  it("mostra da quanto è scaduto un trial già finito", () => {
    render(
      <AdminTrialExpiringTable
        rows={TRIALS}
        now={new Date("2026-08-30T09:00:00.000Z")}
      />,
    );

    expect(screen.getByText("scaduto 2 giorni fa")).toBeInTheDocument();
  });

  it("mostra lo stato vuoto quando non c'è nessun trial in scadenza", () => {
    render(<AdminTrialExpiringTable rows={[]} />);

    expect(
      screen.getByText("Nessun trial in scadenza nei prossimi 7 giorni."),
    ).toBeInTheDocument();
  });
});

describe("AdminTrialActiveMerchantsTable", () => {
  const MERCHANT: AdminMerchant = {
    businessId: "b1",
    businessName: "Bar Centrale",
    ownerName: "Mario Rossi",
    location: "Milano (MI)",
    email: "mario@example.com",
    receipts: 12,
    revenueCents: 45000,
  };

  it("rende le stesse colonne della classifica esercenti", () => {
    render(<AdminTrialActiveMerchantsTable merchants={[MERCHANT]} />);

    expect(screen.getByText("Bar Centrale")).toBeInTheDocument();
    expect(screen.getByText(/450,00/)).toBeInTheDocument();
  });

  it("mostra lo stato vuoto quando nessun trial attivo ha ancora emesso scontrini", () => {
    render(<AdminTrialActiveMerchantsTable merchants={[]} />);

    expect(
      screen.getByText("Nessun trial attivo ha ancora emesso uno scontrino."),
    ).toBeInTheDocument();
  });

  it("lo scheletro mostra il titolo vero della tabella", () => {
    render(<AdminTrialActiveMerchantsSkeleton />);

    expect(screen.getByText("Trial attivi con scontrini")).toBeInTheDocument();
  });
});

describe("AdminStalePendingDocumentsTable", () => {
  const ROW: AdminStalePendingDocumentRow = {
    businessName: "Bar Centrale",
    createdAt: "2026-09-17T08:00:00.000Z",
    amountCents: 1250,
  };

  it("mostra esercente, data scontrino e importo", () => {
    render(<AdminStalePendingDocumentsTable rows={[ROW]} />);

    expect(screen.getByText("Bar Centrale")).toBeInTheDocument();
    expect(screen.getByText("17/09/2026")).toBeInTheDocument();
    expect(screen.getByText(/12,50/)).toBeInTheDocument();
  });

  it("mostra lo stato vuoto quando non c'è nessun documento in sospeso", () => {
    render(<AdminStalePendingDocumentsTable rows={[]} />);

    expect(
      screen.getByText("Nessun documento in sospeso oltre la soglia."),
    ).toBeInTheDocument();
  });

  it("lo scheletro mostra il titolo vero della tabella", () => {
    render(<AdminStalePendingDocumentsSkeleton />);

    expect(screen.getByText("Documenti in sospeso")).toBeInTheDocument();
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
      <AdminSignupsSkeleton key="r" />,
      /registrati e onboarding fermi/i,
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

describe("AdminSignupsTable", () => {
  const STALLED: AdminSignupRow = {
    name: "Mario Rossi",
    email: "fermo@example.com",
    registeredAt: "2026-08-20T08:00:00.000Z",
    status: "stalled",
    outcome: "auth_error",
    attempts: 4,
    stalledSince: "2026-08-21T08:00:00.000Z",
  };
  const OK: AdminSignupRow = {
    ...STALLED,
    email: "ok@example.com",
    status: "ok",
    outcome: null,
    attempts: 0,
    stalledSince: null,
  };
  const NONE: AdminSignupRow = {
    ...OK,
    email: "nuovo@example.com",
    status: "none",
  };

  function signups(overrides: Partial<AdminSignups> = {}): AdminSignups {
    return {
      counts: { total: 7, recent: 2, weeks: 5 },
      inRange: [NONE, OK, STALLED],
      earlier: [],
      ...overrides,
    };
  }

  /** La riga della tabella che contiene `email`. */
  function rowOf(email: string): HTMLElement {
    return screen.getByText(email).closest("tr")!;
  }

  it("dà a ogni riga lo stato d'onboarding: vuoto, ok o fermo", () => {
    render(<AdminSignupsTable signups={signups()} />);

    expect(rowOf("nuovo@example.com")).toHaveTextContent("—");
    expect(rowOf("ok@example.com")).toHaveTextContent("✓ ok");
    expect(rowOf("fermo@example.com")).toHaveTextContent("fermo");
  });

  it("mostra esito, tentativi e data solo per le righe ferme", () => {
    render(<AdminSignupsTable signups={signups()} />);

    expect(rowOf("fermo@example.com")).toHaveTextContent(
      "Credenziali rifiutate",
    );
    expect(rowOf("fermo@example.com")).toHaveTextContent("21/08/2026");
    expect(rowOf("ok@example.com")).not.toHaveTextContent("Mai tentato");
    expect(rowOf("ok@example.com")).not.toHaveTextContent("21/08/2026");
  });

  it("«mai tentato» è un esito, non una cella vuota", () => {
    render(
      <AdminSignupsTable
        signups={signups({
          inRange: [{ ...STALLED, outcome: null, attempts: 0 }],
        })}
      />,
    );

    // Ha salvato le credenziali e non ha mai premuto Verifica (PR #957).
    expect(screen.getByText("Mai tentato")).toBeInTheDocument();
  });

  it("un fermo senza data di salvataggio mostra un trattino, non una data inventata", () => {
    render(
      <AdminSignupsTable
        signups={signups({ inRange: [{ ...STALLED, stalledSince: null }] })}
      />,
    );

    // "Fermo dal" è l'ultima colonna.
    expect(rowOf("fermo@example.com").lastElementChild).toHaveTextContent(
      /^—$/,
    );
  });

  it("separa con un'etichetta i fermi registrati prima del periodo", () => {
    render(
      <AdminSignupsTable
        signups={signups({
          inRange: [OK],
          earlier: [{ ...STALLED, email: "vecchio@example.com" }],
        })}
      />,
    );

    const label = screen.getByRole("rowheader", {
      name: "Fermi registrati prima del periodo",
    });
    expect(label).toBeInTheDocument();
    // L'etichetta sta fra le due metà, non in cima.
    const rows = screen.getAllByRole("row").map((row) => row.textContent);
    const labelAt = rows.findIndex((t) =>
      t?.includes("Fermi registrati prima"),
    );
    expect(rows.findIndex((t) => t?.includes("ok@example.com"))).toBeLessThan(
      labelAt,
    );
    expect(
      rows.findIndex((t) => t?.includes("vecchio@example.com")),
    ).toBeGreaterThan(labelAt);
  });

  it("senza fermi precedenti non disegna l'etichetta", () => {
    render(<AdminSignupsTable signups={signups()} />);

    expect(screen.queryByText("Fermi registrati prima del periodo")).toBeNull();
  });

  it("mostra la tabella anche se nel periodo non si è registrato nessuno", () => {
    render(
      <AdminSignupsTable
        signups={signups({ inRange: [], earlier: [STALLED] })}
      />,
    );

    expect(screen.getByText("fermo@example.com")).toBeInTheDocument();
  });

  it("mostra i conteggi per età sull'intera popolazione ferma, senza la fascia oltre 30", () => {
    render(<AdminSignupsTable signups={signups()} />);

    expect(
      screen.getByText(
        "7 fermi in totale — 2 da meno di 7 giorni, 5 da 7 a 30.",
      ),
    ).toBeInTheDocument();
  });

  it("usa il singolare con un solo fermo", () => {
    render(
      <AdminSignupsTable
        signups={signups({ counts: { total: 1, recent: 1, weeks: 0 } })}
      />,
    );

    expect(screen.getByText(/^1 fermo in totale/)).toBeInTheDocument();
  });

  it("un esito ignoto (precedente al tracciamento) si riduce a un trattino", () => {
    render(
      <AdminSignupsTable
        signups={signups({
          inRange: [{ ...STALLED, outcome: "unknown_pre_tracking" }],
        })}
      />,
    );

    expect(screen.queryByText(/ignoto/i)).not.toBeInTheDocument();
    expect(rowOf("fermo@example.com")).toHaveTextContent("—");
  });

  it("un esito fuori vocabolario ricade sul valore grezzo invece di sparire", () => {
    render(
      <AdminSignupsTable
        signups={signups({
          inRange: [{ ...STALLED, outcome: "qualcosa_di_nuovo" }],
        })}
      />,
    );

    expect(screen.getByText("qualcosa_di_nuovo")).toBeInTheDocument();
  });

  it("mostra lo stato vuoto quando non c'è nessuno da mostrare", () => {
    render(
      <AdminSignupsTable
        signups={{
          counts: { total: 0, recent: 0, weeks: 0 },
          inRange: [],
          earlier: [],
        }}
      />,
    );

    expect(
      screen.getByText(
        "Nessuna registrazione nel periodo e nessun onboarding fermo.",
      ),
    ).toBeInTheDocument();
  });
});
