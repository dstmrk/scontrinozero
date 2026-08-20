import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReceiptNoteSection } from "./receipt-note-section";

const mockUpdateReceiptFooterNote = vi.fn();
vi.mock("@/server/profile-actions", () => ({
  updateReceiptFooterNote: (fd: FormData) => mockUpdateReceiptFooterNote(fd),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateReceiptFooterNote.mockResolvedValue({});
});

function renderSection(initialNote: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReceiptNoteSection businessId="biz-1" initialNote={initialNote} />
    </QueryClientProvider>,
  );
}

const field = () => screen.getByLabelText("Messaggio in fondo allo scontrino");
const saveButton = () => screen.getByRole("button", { name: "Salva" });

function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

describe("ReceiptNoteSection", () => {
  it("precompila il campo con la nota salvata", () => {
    renderSection("Arrivederci e grazie!");
    expect(field()).toHaveValue("Arrivederci e grazie!");
  });

  it("salva la nota e ricarica i dati server", async () => {
    renderSection();
    type("Arrivederci e grazie!");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mockUpdateReceiptFooterNote).toHaveBeenCalledTimes(1),
    );
    const sent = mockUpdateReceiptFooterNote.mock.calls[0][0] as FormData;
    expect(sent.get("receiptFooterNote")).toBe("Arrivederci e grazie!");
    expect(sent.get("businessId")).toBe("biz-1");
    // La pagina cassa porta la nota alla stampa termica: senza refresh la
    // prossima emissione userebbe il valore vecchio.
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    expect(await screen.findByText("Salvato.")).toBeInTheDocument();
  });

  it("non salva finché il testo non cambia", () => {
    renderSection("Arrivederci e grazie!");
    expect(saveButton()).toBeDisabled();
  });

  // Svuotare il campo è il modo di togliere il messaggio: deve restare salvabile.
  it("permette di svuotare una nota esistente", async () => {
    renderSection("Arrivederci e grazie!");
    type("");
    expect(saveButton()).toBeEnabled();

    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(mockUpdateReceiptFooterNote).toHaveBeenCalledTimes(1),
    );
  });

  it("blocca il salvataggio oltre i 64 caratteri", () => {
    renderSection();
    type("a".repeat(65));

    expect(
      screen.getByText("Il messaggio non può superare 64 caratteri."),
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(mockUpdateReceiptFooterNote).not.toHaveBeenCalled();
  });

  it("blocca il salvataggio oltre le 2 righe", () => {
    renderSection();
    type("a\nb\nc");

    expect(
      screen.getByText("Il messaggio non può superare 2 righe."),
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("mostra il contatore dei caratteri usati", () => {
    renderSection();
    type("Grazie!");
    expect(screen.getByText("7/64")).toBeInTheDocument();
  });

  it("mostra l'errore restituito dalla server action", async () => {
    mockUpdateReceiptFooterNote.mockResolvedValue({
      error: "Il messaggio personalizzato è incluso nel piano Pro.",
    });
    renderSection();
    type("Grazie!");
    fireEvent.click(saveButton());

    expect(
      await screen.findByText(
        "Il messaggio personalizzato è incluso nel piano Pro.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Salvato.")).not.toBeInTheDocument();
  });

  it("degrada a un messaggio transitorio se la action lancia", async () => {
    mockUpdateReceiptFooterNote.mockRejectedValue(new Error("boom"));
    renderSection();
    type("Grazie!");
    fireEvent.click(saveButton());

    expect(await screen.findByText(/errore temporaneo/i)).toBeInTheDocument();
  });
});

describe("ReceiptNoteSection — anteprima", () => {
  it("senza testo mostra lo stato vuoto", () => {
    renderSection();
    expect(screen.getByText("nessun messaggio")).toBeInTheDocument();
  });

  // L'anteprima passa per le stesse funzioni della stampa: se divergesse,
  // l'esercente scoprirebbe il vero a capo solo sulla carta.
  it("manda a capo a 32 colonne come la termica 58 mm", () => {
    renderSection();
    type("Grazie per averci scelto, ti aspettiamo presto!");

    const preview = screen.getByText("DOCUMENTO N. 0001-0042").parentElement;
    const rows = Array.from(preview?.querySelectorAll("p") ?? [])
      .map((p) => p.textContent ?? "")
      .filter((text) => !text.startsWith("DOCUMENTO N."));

    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(32);
    expect(rows.join(" ")).toBe(
      "Grazie per averci scelto, ti aspettiamo presto!",
    );
  });

  it("mostra la traslitterazione delle accentate maiuscole (CP437)", () => {
    renderSection();
    type("È SEMPRE UN PIACERE");
    expect(screen.getByText("E' SEMPRE UN PIACERE")).toBeInTheDocument();
  });
});
