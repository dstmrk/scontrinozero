import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

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

// --- Chiave di idempotenza (REVIEW.md #103, slice 3) ---

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
