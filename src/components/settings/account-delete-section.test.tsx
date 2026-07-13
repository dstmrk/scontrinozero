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
  deleteAccount: (fd: FormData) => mockDeleteAccount(fd),
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

const PASSWORD_PLACEHOLDER = "La tua password";

async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
  await screen.findByText("Eliminare l'account?");
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

  it("mostra il messaggio di recupero dati dal portale AdE nel dialog", async () => {
    renderWithQuery();
    await openDialog();

    expect(screen.getByText(/Fatture e Corrispettivi/)).toBeInTheDocument();
    expect(
      screen.getByText(/documenti commerciali già trasmessi/),
    ).toBeInTheDocument();
  });

  it("avvisa che un abbonamento attivo viene annullato immediatamente (REVIEW.md #63)", async () => {
    renderWithQuery();
    await openDialog();

    expect(screen.getByText(/abbonamento attivo/)).toBeInTheDocument();
    expect(
      screen.getByText(/non ti verrà addebitato alcun rinnovo/),
    ).toBeInTheDocument();
  });

  it("il copy generalizza le credenziali AdE a Fisconline o CIE ID", async () => {
    renderWithQuery();
    await openDialog();

    expect(screen.getAllByText(/Fisconline o CIE ID/).length).toBeGreaterThan(
      0,
    );
  });

  it("il bottone di conferma è disabilitato finché non si inserisce la password", async () => {
    renderWithQuery();
    await openDialog();

    const confirmBtn = screen.getByRole("button", {
      name: "Elimina definitivamente",
    });
    expect(confirmBtn).toBeDisabled();
  });

  it("il bottone di conferma si abilita quando la password non è vuota", async () => {
    renderWithQuery();
    await openDialog();

    const input = screen.getByPlaceholderText(PASSWORD_PLACEHOLDER);
    const confirmBtn = screen.getByRole("button", {
      name: "Elimina definitivamente",
    });

    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "SuperSecret123!" } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("passa la password (raw, senza trim) a deleteAccount come currentPassword", async () => {
    renderWithQuery();
    await openDialog();

    fireEvent.change(screen.getByPlaceholderText(PASSWORD_PLACEHOLDER), {
      target: { value: "  SuperSecret123!  " },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Elimina definitivamente" }),
      );
    });

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    const fd = mockDeleteAccount.mock.calls[0][0] as FormData;
    expect(fd.get("currentPassword")).toBe("  SuperSecret123!  ");
  });

  it("mostra un errore se deleteAccount restituisce un errore", async () => {
    mockDeleteAccount.mockResolvedValue({ error: "Password non corretta." });
    renderWithQuery();
    await openDialog();

    fireEvent.change(screen.getByPlaceholderText(PASSWORD_PLACEHOLDER), {
      target: { value: "wrong-password" },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Elimina definitivamente" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Password non corretta.")).toBeInTheDocument();
    });
  });

  it("mostra errore generico se deleteAccount lancia un'eccezione", async () => {
    mockDeleteAccount.mockRejectedValue(new Error("Network error"));
    renderWithQuery();
    await openDialog();

    fireEvent.change(screen.getByPlaceholderText(PASSWORD_PLACEHOLDER), {
      target: { value: "SuperSecret123!" },
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
    await openDialog();

    fireEvent.change(screen.getByPlaceholderText(PASSWORD_PLACEHOLDER), {
      target: { value: "SuperSecret123!" },
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
    await openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    await waitFor(() => {
      expect(
        screen.queryByText("Eliminare l'account?"),
      ).not.toBeInTheDocument();
    });
  });
});
