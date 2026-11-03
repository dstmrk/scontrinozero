import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { mockMutate, mockReset } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// `mutationData` è il valore che `useMutation().data` restituisce: i test che
// verificano il ramo d'errore lo impostano prima di renderizzare.
let mutationData: unknown = undefined;

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    data: mutationData,
  }),
}));

// Le server action importate dall'albero della cassa trascinerebbero `getDb()`
// — e con lui il driver `postgres` — dentro jsdom.
vi.mock("@/server/receipt-actions", () => ({ emitReceipt: vi.fn() }));
vi.mock("@/server/onboarding-actions", () => ({
  changeAdePassword: vi.fn(),
  verifyAdeCredentials: vi.fn(),
}));

import { CassaClient } from "./cassa-client";
import { MemberRoleProvider } from "@/components/dashboard/member-role";
import { formatCurrency } from "@/lib/utils";

const defaultProps = {
  businessId: "11111111-1111-4111-8111-111111111111",
  printProfile: null,
};

const DISCOUNT_LINK = "+ Sconto su questo articolo";

/** Dal carrello vuoto al form articolo. */
function openAddItem() {
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
}

/**
 * Posizione del CTA "Aggiungi" fra i figli del form. jsdom non fa layout,
 * quindi l'indice fra i fratelli è il proxy verificabile del "il bottone non
 * si sposta sotto il pollice".
 */
function ctaSiblingIndex(): number {
  const cta = screen.getByRole("button", { name: "Aggiungi" });
  const siblings = Array.from(cta.parentElement!.children);
  return siblings.indexOf(cta);
}

describe("CassaClient — sconto di riga", () => {
  it("mostra il link sconto già a importo 0, disabilitato", () => {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    openAddItem();

    expect(screen.getByRole("button", { name: DISCOUNT_LINK })).toBeDisabled();
  });

  it("abilita il link sconto appena l'importo è maggiore di zero", () => {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    openAddItem();
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(screen.getByRole("button", { name: DISCOUNT_LINK })).toBeEnabled();
  });

  it("non sposta il CTA quando l'importo passa da 0 a valido", () => {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    openAddItem();

    const before = ctaSiblingIndex();
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(ctaSiblingIndex()).toBe(before);
  });

  it("ignora il click sul link sconto finché l'importo è 0", () => {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    openAddItem();
    fireEvent.click(screen.getByRole("button", { name: DISCOUNT_LINK }));

    expect(screen.queryByText("Sconto sulla riga")).not.toBeInTheDocument();
  });

  it("apre il tastierino sconto al click sul link abilitato", () => {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    openAddItem();
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: DISCOUNT_LINK }));

    expect(screen.getByText("Sconto sulla riga")).toBeInTheDocument();
  });

  it("non renderizza il link sconto senza il gate di piano Pro", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(
      screen.queryByRole("button", { name: DISCOUNT_LINK }),
    ).not.toBeInTheDocument();
  });
});

// --- Chiave di idempotenza (PR #904, slice 3) ---

/** Batte un importo sul tastierino e conferma la riga. */
function addLine(digits: string): void {
  openAddItem();
  for (const digit of digits) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
}

function emit(): void {
  fireEvent.click(screen.getByRole("button", { name: "Continua" }));
  fireEvent.click(screen.getByRole("button", { name: "Emetti scontrino" }));
}

function lastKey(): string {
  return mockMutate.mock.calls.at(-1)?.[0].idempotencyKey as string;
}

describe("CassaClient — chiave di idempotenza", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mutationData = undefined;
  });

  it("riusa la stessa chiave se il carrello non è cambiato", () => {
    render(<CassaClient {...defaultProps} />);
    addLine("500");
    emit();
    const first = lastKey();

    fireEvent.click(screen.getByRole("button", { name: "Emetti scontrino" }));

    // È la proprietà che riapre l'ingresso della stale-recovery: il retry
    // collide sul vincolo UNIQUE invece di inserire una riga nuova e lasciare
    // la precedente PENDING per sempre.
    expect(lastKey()).toBe(first);
    expect(first).toBeTruthy();
  });

  it("conia una chiave nuova quando il carrello cambia", () => {
    render(<CassaClient {...defaultProps} />);
    addLine("500");
    emit();
    const first = lastKey();

    fireEvent.click(screen.getByRole("button", { name: "Torna indietro" }));
    addLine("300");
    emit();

    // Senza questa rotazione un ritocco al carrello produrrebbe
    // IDEMPOTENCY_PAYLOAD_MISMATCH e bloccherebbe l'utente al banco.
    expect(lastKey()).not.toBe(first);
  });

  it("conia una chiave nuova quando cambia la modalità di pagamento", () => {
    render(<CassaClient {...defaultProps} />);
    addLine("500");
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fireEvent.click(screen.getByRole("button", { name: "Emetti scontrino" }));
    const first = lastKey();

    fireEvent.click(screen.getByRole("button", { name: /elettronico/i }));
    fireEvent.click(screen.getByRole("button", { name: "Emetti scontrino" }));

    // Il fingerprint deve essere almeno tanto fine quanto l'hash del server:
    // la modalità di pagamento entra in `hashSaleRequest`.
    expect(lastKey()).not.toBe(first);
  });

  it("indirizza alla verifica quando l'emissione resta in sospeso", () => {
    mutationData = {
      error: "Scontrino precedente ancora in elaborazione.",
      code: "PENDING_IN_PROGRESS",
    };
    render(<CassaClient {...defaultProps} />);
    addLine("500");
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));

    // Il blocco è voluto — riemettere lo stesso carrello rischia il doppione —
    // ma l'utente bloccato deve avere qualcosa da premere (slice 2).
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Non riemettere con lo stesso carrello",
    );
    expect(alert.textContent).toContain("verificarne lo stato");
  });
});

// issue #1099: cambio password e verifica delle credenziali sono del titolare.
// Il server riscrive già il messaggio per il collaboratore (`forMember`); qui
// conta che i comandi non compaiano comunque.
describe("CassaClient — comandi del titolare sugli errori AdE", () => {
  beforeEach(() => {
    mutationData = undefined;
  });

  function renderSummary(role: "owner" | "collaborator") {
    render(
      <MemberRoleProvider role={role}>
        <CassaClient {...defaultProps} />
      </MemberRoleProvider>,
    );
    addLine("500");
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
  }

  it.each([
    ["owner", true],
    ["collaborator", false],
  ] as const)(
    "password scaduta (%s): il cambio password compare solo al titolare",
    (role, visible) => {
      mutationData = {
        error: "La password Fisconline è scaduta.",
        code: "ADE_PASSWORD_EXPIRED",
        passwordExpired: true,
      };
      renderSummary(role);

      const button = screen.queryByRole("button", {
        name: "Cambia password Fisconline",
      });
      expect(button !== null).toBe(visible);
    },
  );

  it.each([
    ["owner", true],
    ["collaborator", false],
  ] as const)(
    "credenziali non verificate (%s): il link alla verifica compare solo al titolare",
    (role, visible) => {
      mutationData = {
        error:
          "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
      };
      renderSummary(role);

      const link = screen.queryByRole("link", { name: "Verificale ora" });
      expect(link !== null).toBe(visible);
    },
  );
});

// --- Tastiera fisica sui tastierini della cassa ---

/**
 * Importo nella resa dell'app, con lo spazio unificatore di `Intl` convertito
 * in spazio normale: Testing Library normalizza il testo del DOM allo stesso
 * modo.
 */
const euro = (value: number): string =>
  formatCurrency(value).replaceAll(" ", " ");

function stubPointerFine(fine: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(pointer: fine)" ? fine : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function keypad(name: string): HTMLElement {
  return screen.getByRole("toolbar", { name });
}

function typeKeys(target: HTMLElement, keys: readonly string[]): void {
  for (const key of keys) fireEvent.keyDown(target, { key });
}

/** Siamo nello step "aggiungi articolo"? */
function inAddItemStep(): boolean {
  return screen.queryByRole("heading", { name: "Aggiungi articolo" }) !== null;
}

describe("CassaClient — tastiera fisica nello step aggiunta riga", () => {
  beforeEach(() => {
    // Il carrello persiste in sessionStorage: senza pulirlo le righe dei test
    // precedenti ricompaiono al mount.
    sessionStorage.clear();
    mockMutate.mockClear();
    mutationData = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("con pointer fine il tastierino Importo prende il focus all'apertura", () => {
    stubPointerFine(true);
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    expect(keypad("Importo")).toHaveFocus();
  });

  it("su touch il tastierino Importo non ruba il focus", () => {
    stubPointerFine(false);
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    expect(keypad("Importo")).not.toHaveFocus();
  });

  it("digitare 1, 2, ',', 5, 0 mostra €12,50", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    typeKeys(keypad("Importo"), ["1", "2", ",", "5", "0"]);

    expect(screen.getByText(euro(12.5))).toBeInTheDocument();
  });

  it("Backspace e Delete agiscono sul display dell'importo", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    typeKeys(keypad("Importo"), ["1", "2", "5", "0", "Backspace"]);
    expect(screen.getByText(euro(1.25))).toBeInTheDocument();

    typeKeys(keypad("Importo"), ["Delete"]);
    expect(screen.getByText(euro(0))).toBeInTheDocument();
  });

  it("'Aggiungi' dopo l'importo digitato aggiunge la riga con quel valore", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    typeKeys(keypad("Importo"), ["1", "2", ",", "5", "0"]);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    expect(inAddItemStep()).toBe(false);
    expect(screen.getByText("Vendita")).toBeInTheDocument();
    expect(screen.getAllByText(euro(12.5)).length).toBeGreaterThan(0);
  });

  it("Enter con importo > 0 aggiunge la riga e torna al carrello", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    typeKeys(keypad("Importo"), ["3", "5", "0", "Enter"]);

    expect(inAddItemStep()).toBe(false);
    expect(screen.getByText("Vendita")).toBeInTheDocument();
    expect(screen.getAllByText(euro(3.5)).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Continua" }),
    ).toBeInTheDocument();
  });

  it("Enter con importo 0 non aggiunge nulla e resta nello step", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    typeKeys(keypad("Importo"), ["Enter"]);

    expect(inAddItemStep()).toBe(true);
    expect(screen.queryByText("Vendita")).not.toBeInTheDocument();
  });

  it("Enter usa la descrizione digitata, come il bottone", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    fireEvent.change(screen.getByPlaceholderText("Descrizione (opzionale)"), {
      target: { value: "Caffè" },
    });
    typeKeys(keypad("Importo"), ["1", "2", "0", "Enter"]);

    expect(screen.getByText("Caffè")).toBeInTheDocument();
  });

  it("Escape annulla: torna al carrello senza righe e resetta il form", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();

    fireEvent.change(screen.getByPlaceholderText("Descrizione (opzionale)"), {
      target: { value: "Pane" },
    });
    typeKeys(keypad("Importo"), ["9", "9", "Escape"]);

    expect(inAddItemStep()).toBe(false);
    expect(screen.getByText(/Nessun articolo/)).toBeInTheDocument();

    openAddItem();
    expect(screen.getByText(euro(0))).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Descrizione (opzionale)")).toHaveValue(
      "",
    );
  });

  it("le cifre digitate nella descrizione non cambiano l'importo", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();
    const descr = screen.getByPlaceholderText("Descrizione (opzionale)");

    typeKeys(descr, ["1", "2", "3", "Backspace", "Delete"]);
    fireEvent.change(descr, { target: { value: "123" } });

    expect(screen.getByText(euro(0))).toBeInTheDocument();
    expect(descr).toHaveValue("123");
  });

  it("Enter ed Escape nella descrizione non chiudono lo step", () => {
    render(<CassaClient {...defaultProps} />);
    openAddItem();
    typeKeys(keypad("Importo"), ["5", "0", "0"]);

    typeKeys(screen.getByPlaceholderText("Descrizione (opzionale)"), [
      "Enter",
      "Escape",
    ]);

    expect(inAddItemStep()).toBe(true);
    expect(screen.getByText(euro(5))).toBeInTheDocument();
  });
});

describe("CassaClient — tastiera fisica sullo sconto di riga", () => {
  beforeEach(() => {
    // Il carrello persiste in sessionStorage: senza pulirlo le righe dei test
    // precedenti ricompaiono al mount.
    sessionStorage.clear();
    mockMutate.mockClear();
    mutationData = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Importo €5,00 e tastierino sconto aperto. */
  function openLineDiscount(): void {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    openAddItem();
    typeKeys(keypad("Importo"), ["5", "0", "0"]);
    fireEvent.click(screen.getByRole("button", { name: DISCOUNT_LINK }));
  }

  it("con pointer fine il tastierino sconto prende il focus all'apertura", () => {
    stubPointerFine(true);
    openLineDiscount();

    expect(keypad("Sconto sulla riga")).toHaveFocus();
  });

  it("riceve le cifre e le mostra come sconto", () => {
    openLineDiscount();

    typeKeys(keypad("Sconto sulla riga"), ["1", "0", "0"]);

    expect(screen.getByText(`-${euro(1)}`)).toBeInTheDocument();
  });

  it("clampa lo sconto digitato a importo × quantità", () => {
    openLineDiscount();

    typeKeys(keypad("Sconto sulla riga"), ["9", "9", "9"]);

    expect(screen.getByText(`-${euro(5)}`)).toBeInTheDocument();
  });

  it("le cifre sullo sconto non toccano l'importo", () => {
    openLineDiscount();

    typeKeys(keypad("Sconto sulla riga"), ["1", "0", "0"]);

    // Il display dell'importo resta €5,00 (match esatto: lo sconto è "-1,00 €").
    expect(screen.getByText(euro(5))).toBeInTheDocument();
  });

  it("le cifre sull'importo non toccano lo sconto", () => {
    openLineDiscount();
    typeKeys(keypad("Sconto sulla riga"), ["1", "0", "0"]);

    typeKeys(keypad("Importo"), ["0"]);

    expect(screen.getByText(euro(50))).toBeInTheDocument();
    expect(screen.getByText(`-${euro(1)}`)).toBeInTheDocument();
  });

  it("Enter sul tastierino sconto aggiunge la riga scontata", () => {
    openLineDiscount();

    typeKeys(keypad("Sconto sulla riga"), ["1", "0", "0", "Enter"]);

    expect(inAddItemStep()).toBe(false);
    expect(screen.getByText("Vendita")).toBeInTheDocument();
    expect(screen.getByText(`Sconto −${euro(1)}`)).toBeInTheDocument();
  });

  it("Escape sul tastierino sconto annulla lo step", () => {
    openLineDiscount();

    typeKeys(keypad("Sconto sulla riga"), ["1", "0", "0", "Escape"]);

    expect(inAddItemStep()).toBe(false);
    expect(screen.getByText(/Nessun articolo/)).toBeInTheDocument();
  });
});

describe("CassaClient — tastiera fisica nel riepilogo", () => {
  beforeEach(() => {
    // Il carrello persiste in sessionStorage: senza pulirlo le righe dei test
    // precedenti ricompaiono al mount.
    sessionStorage.clear();
    mockMutate.mockClear();
    mutationData = undefined;
  });

  /** Una riga da €5,00, riepilogo aperto, pannello "Altre opzioni" aperto. */
  function openSummaryOptions(): void {
    render(<CassaClient {...defaultProps} discountsUnlocked />);
    addLine("500");
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fireEvent.click(screen.getByRole("button", { name: /altre opzioni/i }));
  }

  it("Enter ed Escape sullo sconto a pagare non emettono né chiudono", () => {
    openSummaryOptions();
    fireEvent.click(screen.getByText("+ Sconto a pagare"));
    const toolbar = keypad("Sconto a pagare");

    typeKeys(toolbar, ["1", "0", "0", "Enter", "Escape"]);

    expect(mockMutate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Emetti scontrino" }),
    ).toBeInTheDocument();
    expect(keypad("Sconto a pagare")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Rimuovi sconto a pagare"),
    ).toBeInTheDocument();
  });

  it("Enter ed Escape sui contanti del misto non emettono né chiudono", () => {
    openSummaryOptions();
    fireEvent.click(screen.getByText("+ Pagamento misto"));

    typeKeys(keypad("Contanti"), ["2", "0", "0", "Enter", "Escape"]);

    expect(mockMutate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Emetti scontrino" }),
    ).toBeInTheDocument();
    expect(keypad("Contanti")).toBeInTheDocument();
  });

  it("le cifre sui contanti aggiornano la ripartizione", () => {
    openSummaryOptions();
    fireEvent.click(screen.getByText("+ Pagamento misto"));

    typeKeys(keypad("Contanti"), ["2", "0", "0"]);

    // €5,00 incassati: €2,00 in contanti, €3,00 il resto elettronico.
    expect(screen.getAllByText(euro(2)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(euro(3)).length).toBeGreaterThan(0);
  });
});
