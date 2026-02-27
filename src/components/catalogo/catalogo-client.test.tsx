import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CatalogoClient } from "./catalogo-client";
import type { CatalogItem } from "@/types/catalogo";

// --- Mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetCatalogItems = vi.fn();
const mockDeleteCatalogItem = vi.fn();
vi.mock("@/server/catalog-actions", () => ({
  getCatalogItems: (...args: unknown[]) => mockGetCatalogItems(...args),
  deleteCatalogItem: (...args: unknown[]) => mockDeleteCatalogItem(...args),
  addCatalogItem: vi.fn(),
}));

// scrollIntoView richiesto da Radix UI Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockDeleteCatalogItem.mockResolvedValue({});
  mockGetCatalogItems.mockResolvedValue([]);
});

// --- Fixtures ---

const FAKE_ITEMS: CatalogItem[] = [
  {
    id: "item-1",
    businessId: "biz-1",
    description: "Caffè espresso",
    defaultPrice: "1.20",
    defaultVatCode: "22",
    createdAt: new Date("2026-01-01"),
  },
  {
    id: "item-2",
    businessId: "biz-1",
    description: "Pizza margherita",
    defaultPrice: "9.50",
    defaultVatCode: "10",
    createdAt: new Date("2026-01-02"),
  },
];

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// --- Tests ---

describe("CatalogoClient", () => {
  it("mostra l'empty state quando non ci sono prodotti", () => {
    renderWithQuery(<CatalogoClient businessId="biz-1" initialData={[]} />);

    expect(
      screen.getByText(/nessun prodotto nel catalogo/i),
    ).toBeInTheDocument();
  });

  it("mostra il pulsante Aggiungi", () => {
    renderWithQuery(<CatalogoClient businessId="biz-1" initialData={[]} />);

    expect(
      screen.getByRole("button", { name: /aggiungi/i }),
    ).toBeInTheDocument();
  });

  it("renderizza i prodotti del catalogo", () => {
    renderWithQuery(
      <CatalogoClient businessId="biz-1" initialData={FAKE_ITEMS} />,
    );

    expect(screen.getByText("Caffè espresso")).toBeInTheDocument();
    expect(screen.getByText("Pizza margherita")).toBeInTheDocument();
  });

  it("click su un prodotto naviga alla cassa con i parametri corretti", () => {
    renderWithQuery(
      <CatalogoClient businessId="biz-1" initialData={FAKE_ITEMS} />,
    );

    fireEvent.click(screen.getByText("Caffè espresso"));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/dashboard/cassa"),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("description=Caff%C3%A8+espresso"),
    );
  });

  it("click sull'icona elimina mostra i bottoni di conferma", () => {
    renderWithQuery(
      <CatalogoClient businessId="biz-1" initialData={FAKE_ITEMS} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /elimina caffè espresso/i }),
    );

    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
  });

  it("click su '+' apre il dialog di aggiunta prodotto", () => {
    renderWithQuery(<CatalogoClient businessId="biz-1" initialData={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /aggiungi/i }));

    expect(screen.getByText("Aggiungi prodotto")).toBeInTheDocument();
  });

  it("conferma eliminazione rimuove il prodotto dalla lista", async () => {
    renderWithQuery(
      <CatalogoClient businessId="biz-1" initialData={FAKE_ITEMS} />,
    );

    // Click trash icon → mostra conferma
    fireEvent.click(
      screen.getByRole("button", { name: /elimina caffè espresso/i }),
    );

    // Click Elimina → esegue la cancellazione
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    });

    await waitFor(() => {
      expect(screen.queryByText("Caffè espresso")).not.toBeInTheDocument();
    });
    expect(mockDeleteCatalogItem).toHaveBeenCalledWith("item-1", "biz-1");
  });

  it("click Annulla nel dialog di conferma nasconde i bottoni di conferma", () => {
    renderWithQuery(
      <CatalogoClient businessId="biz-1" initialData={FAKE_ITEMS} />,
    );

    // Apre conferma
    fireEvent.click(
      screen.getByRole("button", { name: /elimina caffè espresso/i }),
    );
    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();

    // Annulla la conferma
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(
      screen.queryByRole("button", { name: "Elimina" }),
    ).not.toBeInTheDocument();
  });

  it("mostra errore se deleteCatalogItem ritorna un errore", async () => {
    mockDeleteCatalogItem.mockResolvedValue({
      error: "Errore durante l'eliminazione.",
    });

    renderWithQuery(
      <CatalogoClient businessId="biz-1" initialData={FAKE_ITEMS} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /elimina caffè espresso/i }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Errore durante l'eliminazione.",
      );
    });
    // Il prodotto rimane nella lista
    expect(screen.getByText("Caffè espresso")).toBeInTheDocument();
  });
});
