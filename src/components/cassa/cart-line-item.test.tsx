import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CartLineItem } from "./cart-line-item";
import { CartLine } from "@/types/cassa";

const line: CartLine = {
  id: "test-id-1",
  description: "Pizza Margherita",
  quantity: 2,
  grossUnitPrice: 8.5,
  vatCode: "10",
};

describe("CartLineItem", () => {
  it("mostra la descrizione dell'articolo", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    expect(screen.getByText("Pizza Margherita")).toBeInTheDocument();
  });

  it("mostra la quantità", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it("mostra il prezzo unitario in formato italiano", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    expect(screen.getByText(/8,50/)).toBeInTheDocument();
  });

  it("mostra il totale di riga (qty × prezzo) in formato italiano", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    // 2 × 8.50 = 17.00
    expect(screen.getByText(/17,00/)).toBeInTheDocument();
  });

  it("mostra il badge con l'aliquota IVA", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("ha un bottone per rimuovere l'articolo", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /rimuovi|elimina|remove/i }),
    ).toBeInTheDocument();
  });

  it("non mostra il bottone modifica se onEdit non è fornito", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /modifica/i }),
    ).not.toBeInTheDocument();
  });

  it("mostra il bottone modifica se onEdit è fornito", () => {
    render(<CartLineItem line={line} onRemove={vi.fn()} onEdit={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /modifica/i }),
    ).toBeInTheDocument();
  });

  it("chiama onEdit con l'id corretto quando si preme il bottone modifica", () => {
    const onEdit = vi.fn();
    render(<CartLineItem line={line} onRemove={vi.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: /modifica/i }));
    expect(onEdit).toHaveBeenCalledWith("test-id-1");
  });

  it("chiama onRemove con l'id corretto quando si preme il bottone rimuovi", () => {
    const onRemove = vi.fn();
    render(<CartLineItem line={line} onRemove={onRemove} />);

    fireEvent.click(
      screen.getByRole("button", { name: /rimuovi|elimina|remove/i }),
    );

    expect(onRemove).toHaveBeenCalledWith("test-id-1");
  });

  it("mostra 4% per articoli con IVA al 4%", () => {
    const lineWith4 = { ...line, vatCode: "4" as const };
    render(<CartLineItem line={lineWith4} onRemove={vi.fn()} />);
    expect(screen.getByText("4%")).toBeInTheDocument();
  });

  it("mostra 22% per articoli con IVA al 22%", () => {
    const lineWith22 = { ...line, vatCode: "22" as const };
    render(<CartLineItem line={lineWith22} onRemove={vi.fn()} />);
    expect(screen.getByText("22%")).toBeInTheDocument();
  });

  it("calcola correttamente il totale con quantità decimale", () => {
    const lineDecimalQty: CartLine = {
      ...line,
      quantity: 1.5,
      grossUnitPrice: 10,
    };
    render(<CartLineItem line={lineDecimalQty} onRemove={vi.fn()} />);
    // 1.5 × 10 = 15.00
    expect(screen.getByText(/15,00/)).toBeInTheDocument();
  });
});
