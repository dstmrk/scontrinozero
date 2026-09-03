import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChangeAdePasswordDialog } from "./change-ade-password-dialog";

const mockChangeAdePassword = vi.fn();
vi.mock("@/server/onboarding-actions", () => ({
  changeAdePassword: (
    businessId: string,
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string,
  ) =>
    mockChangeAdePassword(
      businessId,
      currentPassword,
      newPassword,
      confirmNewPassword,
    ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockChangeAdePassword.mockResolvedValue({ businessId: "biz-1" });
});

function renderDialog(onSuccess = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ChangeAdePasswordDialog
        businessId="biz-1"
        open
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );
  return { onClose, onSuccess };
}

function fillForm({
  current = "OldPass1!",
  next = "NewPass1!",
  confirm = "NewPass1!",
}: { current?: string; next?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Password attuale"), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText("Nuova password"), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText("Conferma nuova password"), {
    target: { value: confirm },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));
}

describe("ChangeAdePasswordDialog", () => {
  it("nuova password fuori dal set di caratteri ammessi → errore di validazione, nessuna submit", async () => {
    renderDialog();

    fillForm({ next: "café123!", confirm: "café123!" }); // "é" accentata non ammessa
    submit();

    expect(await screen.findByText(/8–15 caratteri/)).toBeInTheDocument();
    expect(mockChangeAdePassword).not.toHaveBeenCalled();
  });

  it("nuova password sotto la lunghezza minima → errore di validazione", async () => {
    renderDialog();

    fillForm({ next: "Short1!", confirm: "Short1!" });
    submit();

    expect(await screen.findByText(/8–15 caratteri/)).toBeInTheDocument();
    expect(mockChangeAdePassword).not.toHaveBeenCalled();
  });

  it("nuova password e conferma diverse → 'Le password non coincidono.'", async () => {
    renderDialog();

    fillForm({ next: "NewPass1!", confirm: "NewPass2!" });
    submit();

    expect(
      await screen.findByText("Le password non coincidono."),
    ).toBeInTheDocument();
    expect(mockChangeAdePassword).not.toHaveBeenCalled();
  });

  it("nuova password identica all'attuale → errore dedicato", async () => {
    renderDialog();

    fillForm({
      current: "SamePass1!",
      next: "SamePass1!",
      confirm: "SamePass1!",
    });
    submit();

    expect(
      await screen.findByText(
        "La nuova password deve essere diversa da quella attuale.",
      ),
    ).toBeInTheDocument();
    expect(mockChangeAdePassword).not.toHaveBeenCalled();
  });

  it("form valido → invoca changeAdePassword con gli argomenti corretti e chiama onSuccess", async () => {
    const { onSuccess } = renderDialog();

    fillForm();
    submit();

    await waitFor(() =>
      expect(mockChangeAdePassword).toHaveBeenCalledWith(
        "biz-1",
        "OldPass1!",
        "NewPass1!",
        "NewPass1!",
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("mostra l'errore restituito dalla server action senza chiamare onSuccess", async () => {
    mockChangeAdePassword.mockResolvedValue({
      error: "Le credenziali sono state modificate nel frattempo.",
    });
    const { onSuccess } = renderDialog();

    fillForm();
    submit();

    expect(
      await screen.findByText(
        "Le credenziali sono state modificate nel frattempo.",
      ),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
