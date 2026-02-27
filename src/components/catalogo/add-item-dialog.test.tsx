import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddItemDialog } from "./add-item-dialog";

// --- Mocks ---

const mockAddCatalogItem = vi.fn();
vi.mock("@/server/catalog-actions", () => ({
  addCatalogItem: (...args: unknown[]) => mockAddCatalogItem(...args),
}));

// scrollIntoView richiesto da Radix UI Select e Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockAddCatalogItem.mockResolvedValue({});
});

// --- Fixtures ---

const DEFAULT_PROPS = {
  businessId: "biz-123",
  onSuccess: vi.fn(),
  onClose: vi.fn(),
};

// --- Tests ---

describe("AddItemDialog", () => {
  it("renderizza il titolo del dialog", () => {
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText("Aggiungi prodotto")).toBeInTheDocument();
  });

  it("renderizza il campo descrizione", () => {
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByLabelText("Descrizione")).toBeInTheDocument();
  });

  it("renderizza il campo prezzo", () => {
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByLabelText("Prezzo (€)")).toBeInTheDocument();
  });

  it("renderizza il selettore aliquota IVA", () => {
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText("Aliquota IVA")).toBeInTheDocument();
  });

  it("renderizza i pulsanti Annulla e Aggiungi", () => {
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aggiungi" }),
    ).toBeInTheDocument();
  });

  it("click su Annulla chiama onClose", () => {
    const onClose = vi.fn();
    render(<AddItemDialog {...DEFAULT_PROPS} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("invio form chiama addCatalogItem con i dati corretti", async () => {
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    fireEvent.change(screen.getByLabelText("Descrizione"), {
      target: { value: "Caffè espresso" },
    });
    fireEvent.change(screen.getByLabelText("Prezzo (€)"), {
      target: { value: "1.20" },
    });

    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Aggiungi" }).closest("form")!,
      );
    });

    expect(mockAddCatalogItem).toHaveBeenCalledWith({
      businessId: "biz-123",
      description: "Caffè espresso",
      defaultPrice: "1.20",
      defaultVatCode: "22",
    });
  });

  it("chiama onSuccess dopo aggiunta riuscita", async () => {
    const onSuccess = vi.fn();
    render(<AddItemDialog {...DEFAULT_PROPS} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText("Descrizione"), {
      target: { value: "Caffè" },
    });
    fireEvent.change(screen.getByLabelText("Prezzo (€)"), {
      target: { value: "1.00" },
    });

    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Aggiungi" }).closest("form")!,
      );
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it("mostra l'errore restituito da addCatalogItem", async () => {
    mockAddCatalogItem.mockResolvedValue({
      error: "La descrizione è obbligatoria.",
    });
    render(<AddItemDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Aggiungi" }).closest("form")!,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "La descrizione è obbligatoria.",
      );
    });
  });

  it("non chiama onSuccess in caso di errore da addCatalogItem", async () => {
    mockAddCatalogItem.mockResolvedValue({ error: "Errore test" });
    const onSuccess = vi.fn();
    render(<AddItemDialog {...DEFAULT_PROPS} onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Aggiungi" }).closest("form")!,
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
