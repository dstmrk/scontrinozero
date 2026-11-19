import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CatalogGrid, cartQuantityFor } from "./catalog-grid";
import type { CatalogItem } from "@/types/catalogo";
import type { CartLine } from "@/types/cassa";
import { formatCurrency } from "@/lib/utils";

const PRICE = formatCurrency(1.2);
/** Lo stesso importo come lo legge `getByText`, che normalizza lo spazio unificatore. */
const PRICE_TEXT = PRICE.replaceAll("\u00a0", " ");

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "item-1",
    businessId: "biz",
    description: "Caffè",
    defaultPrice: "1.20",
    defaultVatCode: "10",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "line-1",
    description: "Caffè",
    quantity: 1,
    grossUnitPrice: 1.2,
    vatCode: "10",
    ...overrides,
  };
}

describe("cartQuantityFor", () => {
  it("somma le quantità delle righe con stessa descrizione, prezzo e IVA", () => {
    const lines = [
      line({ id: "a", quantity: 2 }),
      line({ id: "b", quantity: 1.5 }),
    ];
    expect(cartQuantityFor(item(), lines)).toBe(3.5);
  });

  it("ignora righe con stessa descrizione ma prezzo o IVA diversi", () => {
    const lines = [
      line({ id: "a", grossUnitPrice: 1.5 }),
      line({ id: "b", vatCode: "22" }),
      line({ id: "c", description: "Cappuccino" }),
    ];
    expect(cartQuantityFor(item(), lines)).toBe(0);
  });

  it("per un prodotto senza prezzo conta le righe a qualsiasi prezzo", () => {
    const lines = [
      line({ id: "a", grossUnitPrice: 3 }),
      line({ id: "b", grossUnitPrice: 7 }),
    ];
    expect(cartQuantityFor(item({ defaultPrice: null }), lines)).toBe(2);
  });

  it("evita la deriva floating point sulle quantità frazionarie", () => {
    const lines = [
      line({ id: "a", quantity: 0.1 }),
      line({ id: "b", quantity: 0.2 }),
    ];
    expect(cartQuantityFor(item(), lines)).toBe(0.3);
  });
});

describe("CatalogGrid", () => {
  it("mostra descrizione e prezzo di ogni prodotto", () => {
    render(
      <CatalogGrid
        items={[item(), item({ id: "item-2", description: "Panino" })]}
        lines={[]}
        onSelect={vi.fn()}
      />,
    );
    const caffe = screen.getByRole("button", { name: /Caffè/ });
    expect(within(caffe).getByText(PRICE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Panino/ })).toBeInTheDocument();
  });

  it("un prodotto senza prezzo dice che l'importo si digita", () => {
    render(
      <CatalogGrid
        items={[item({ defaultPrice: null })]}
        lines={[]}
        onSelect={vi.fn()}
      />,
    );
    // Sulla tile compatta basta «libero»; lo screen reader sente la forma
    // estesa.
    const tile = screen.getByRole("button", { name: "Caffè, Prezzo libero" });
    expect(within(tile).getByText("libero")).toBeInTheDocument();
  });

  it("la descrizione troncata resta leggibile per intero al passaggio del mouse", () => {
    render(
      <CatalogGrid
        items={[item({ description: "Spremuta d'arancia rossa di Sicilia" })]}
        lines={[]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Spremuta/ })).toHaveAttribute(
      "title",
      "Spremuta d'arancia rossa di Sicilia",
    );
  });

  it("il tap passa il prodotto a onSelect", () => {
    const onSelect = vi.fn();
    const caffe = item();
    render(<CatalogGrid items={[caffe]} lines={[]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Caffè/ }));
    expect(onSelect).toHaveBeenCalledWith(caffe);
  });

  it("due tap rapidi sulla tile restano due tap, non uno zoom (touch-action)", () => {
    // Senza `touch-action: manipulation` iOS Safari può leggere il secondo tap
    // ravvicinato come gesto di zoom e perdere il pezzo: "due caffè" diventa uno.
    render(<CatalogGrid items={[item()]} lines={[]} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Caffè/ })).toHaveClass(
      "[touch-action:manipulation]",
    );
  });

  it("il badge mostra quante unità del prodotto sono nel carrello", () => {
    render(
      <CatalogGrid
        items={[item()]}
        lines={[line({ quantity: 3 })]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Caffè, ${PRICE}, 3 nel carrello` }),
    ).toBeInTheDocument();
  });

  it("senza unità nel carrello non mostra il badge", () => {
    render(<CatalogGrid items={[item()]} lines={[]} onSelect={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: `Caffè, ${PRICE}` }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("catalog-qty-badge")).not.toBeInTheDocument();
  });

  it("con catalogo vuoto non renderizza nulla", () => {
    const { container } = render(
      <CatalogGrid items={[]} lines={[]} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
