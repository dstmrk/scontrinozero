import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const { mockMutate, mockReset } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    data: undefined,
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
