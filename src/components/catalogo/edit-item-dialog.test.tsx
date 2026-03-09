import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditItemDialog } from "./edit-item-dialog";
import type { CatalogItem } from "@/types/catalogo";

// --- Mocks ---

const mockUpdateCatalogItem = vi.fn();
vi.mock("@/server/catalog-actions", () => ({
  updateCatalogItem: (...args: unknown[]) => mockUpdateCatalogItem(...args),
}));

// scrollIntoView richiesto da Radix UI Select e Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockUpdateCatalogItem.mockResolvedValue({});
});

// --- Fixtures ---

const FAKE_ITEM: CatalogItem = {
  id: "item-123",
  businessId: "biz-456",
  description: "Pizza margherita",
  defaultPrice: "9.50",
  defaultVatCode: "10",
  createdAt: new Date("2026-01-01"),
};

const DEFAULT_PROPS = {
  businessId: "biz-456",
  item: FAKE_ITEM,
  onSuccess: vi.fn(),
  onClose: vi.fn(),
};

// --- Tests ---

describe("EditItemDialog", () => {
  it("renderizza il titolo 'Modifica prodotto'", () => {
    render(<EditItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText("Modifica prodotto")).toBeInTheDocument();
  });

  it("pre-popola il campo descrizione con il valore dell'item", () => {
    render(<EditItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByLabelText("Descrizione")).toHaveValue(
      "Pizza margherita",
    );
  });

  it("pre-popola il campo prezzo con il valore dell'item", () => {
    render(<EditItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByLabelText(/prezzo/i)).toHaveValue(9.5);
  });

  it("renderizza i pulsanti Annulla e Salva", () => {
    render(<EditItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva" })).toBeInTheDocument();
  });

  it("click su Annulla chiama onClose", () => {
    const onClose = vi.fn();
    render(<EditItemDialog {...DEFAULT_PROPS} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("invio form chiama updateCatalogItem con i dati corretti", async () => {
    render(<EditItemDialog {...DEFAULT_PROPS} />);

    fireEvent.change(screen.getByLabelText("Descrizione"), {
      target: { value: "Pizza marinara" },
    });

    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Salva" }).closest("form")!,
      );
    });

    expect(mockUpdateCatalogItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-123",
        businessId: "biz-456",
        description: "Pizza marinara",
      }),
    );
  });

  it("chiama onSuccess dopo aggiornamento riuscito", async () => {
    const onSuccess = vi.fn();
    render(<EditItemDialog {...DEFAULT_PROPS} onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Salva" }).closest("form")!,
      );
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it("pre-popola il campo prezzo come stringa vuota se defaultPrice è null", () => {
    const itemNoPrice: CatalogItem = { ...FAKE_ITEM, defaultPrice: null };
    render(<EditItemDialog {...DEFAULT_PROPS} item={itemNoPrice} />);

    expect(screen.getByLabelText(/prezzo/i)).toHaveValue(null);
  });
});
