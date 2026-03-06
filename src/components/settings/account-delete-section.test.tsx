import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDeleteSection } from "./account-delete-section";

// --- Mocks ---

const mockDeleteAccount = vi.fn();
vi.mock("@/server/account-actions", () => ({
  deleteAccount: () => mockDeleteAccount(),
}));

// scrollIntoView richiesto da Radix UI Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockDeleteAccount.mockResolvedValue({});
});

// --- Helpers ---

function renderWithQuery() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AccountDeleteSection />
    </QueryClientProvider>,
  );
}

// --- Tests ---

describe("AccountDeleteSection", () => {
  it("mostra il bottone 'Elimina account' nella zona pericolosa", () => {
    renderWithQuery();

    expect(screen.getByText("Zona pericolosa")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Elimina account" }),
    ).toBeInTheDocument();
  });

  it("apre il dialog al click su 'Elimina account'", async () => {
    renderWithQuery();

    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));

    expect(await screen.findByText("Eliminare l'account?")).toBeInTheDocument();
  });

  it("il bottone di conferma è disabilitato se il testo non è 'ELIMINA'", async () => {
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    const confirmBtn = screen.getByRole("button", {
      name: "Elimina definitivamente",
    });
    expect(confirmBtn).toBeDisabled();
  });

  it("il bottone di conferma si abilita solo con la parola esatta 'ELIMINA'", async () => {
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    const input = screen.getByPlaceholderText("ELIMINA");
    const confirmBtn = screen.getByRole("button", {
      name: "Elimina definitivamente",
    });

    fireEvent.change(input, { target: { value: "elimina" } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "ELIMINA" } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("chiama deleteAccount al click sul bottone di conferma", async () => {
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    fireEvent.change(screen.getByPlaceholderText("ELIMINA"), {
      target: { value: "ELIMINA" },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Elimina definitivamente" }),
      );
    });

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("mostra un errore se deleteAccount restituisce un errore", async () => {
    mockDeleteAccount.mockResolvedValue({ error: "Profilo non trovato." });
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    fireEvent.change(screen.getByPlaceholderText("ELIMINA"), {
      target: { value: "ELIMINA" },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Elimina definitivamente" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Profilo non trovato.")).toBeInTheDocument();
    });
  });

  it("mostra errore generico se deleteAccount lancia un'eccezione", async () => {
    mockDeleteAccount.mockRejectedValue(new Error("Network error"));
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    fireEvent.change(screen.getByPlaceholderText("ELIMINA"), {
      target: { value: "ELIMINA" },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Elimina definitivamente" }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText("Si è verificato un errore. Riprova più tardi."),
      ).toBeInTheDocument();
    });
  });

  it("non mostra errore generico per eccezioni NEXT_REDIRECT", async () => {
    const redirectErr = Object.assign(new Error("redirect"), {
      digest: "NEXT_REDIRECT;replace;/;",
    });
    mockDeleteAccount.mockRejectedValue(redirectErr);
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    fireEvent.change(screen.getByPlaceholderText("ELIMINA"), {
      target: { value: "ELIMINA" },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Elimina definitivamente" }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByText("Si è verificato un errore. Riprova più tardi."),
      ).not.toBeInTheDocument();
    });
  });

  it("chiude il dialog al click su Annulla", async () => {
    renderWithQuery();
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    await screen.findByText("Eliminare l'account?");

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    await waitFor(() => {
      expect(
        screen.queryByText("Eliminare l'account?"),
      ).not.toBeInTheDocument();
    });
  });
});
