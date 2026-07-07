import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditAdeCredentialsSection } from "./edit-ade-credentials-section";
import type { AdeLoginMethod } from "@/lib/ade/types";

const mockSaveAdeCredentials = vi.fn();
vi.mock("@/server/onboarding-actions", () => ({
  saveAdeCredentials: (fd: FormData) => mockSaveAdeCredentials(fd),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveAdeCredentials.mockResolvedValue({ businessId: "biz-1" });
});

function renderSection(currentMethod?: AdeLoginMethod) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditAdeCredentialsSection
        businessId="biz-1"
        currentMethod={currentMethod}
      />
    </QueryClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(
    screen.getByRole("button", { name: "Modifica credenziali AdE" }),
  );
}

describe("EditAdeCredentialsSection", () => {
  it("apre con Fisconline di default e mostra il campo codice fiscale", () => {
    renderSection();
    openDialog();

    expect(screen.getByText("Codice fiscale")).toBeInTheDocument();
    expect(screen.queryByText("Email dell'app CIE ID")).not.toBeInTheDocument();
  });

  it("il toggle CIE mostra il campo email al posto di CF/PIN", () => {
    renderSection();
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "CIE" }));

    expect(screen.getByText("Email dell'app CIE ID")).toBeInTheDocument();
    expect(screen.queryByText("Codice fiscale")).not.toBeInTheDocument();
  });

  it("preseleziona CIE quando currentMethod è 'cie'", () => {
    renderSection("cie");
    openDialog();

    expect(screen.getByText("Email dell'app CIE ID")).toBeInTheDocument();
  });

  it("salva con login_method 'cie' e lo username email", async () => {
    renderSection("cie");
    openDialog();

    fireEvent.change(
      screen.getByPlaceholderText("La tua email registrata su CIE ID"),
      { target: { value: "mario.rossi@example.com" } },
    );
    fireEvent.change(screen.getByLabelText("Password CIE ID"), {
      target: { value: "cie-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(mockSaveAdeCredentials).toHaveBeenCalled());
    const fd = mockSaveAdeCredentials.mock.calls[0][0] as FormData;
    expect(fd.get("loginMethod")).toBe("cie");
    expect(fd.get("username")).toBe("mario.rossi@example.com");
    expect(fd.get("codiceFiscale")).toBeNull();
  });

  it("mostra l'errore restituito dalla server action", async () => {
    mockSaveAdeCredentials.mockResolvedValue({
      error: "L'accesso con SPID non è disponibile.",
    });
    renderSection();
    openDialog();

    fireEvent.change(screen.getByLabelText("Codice fiscale"), {
      target: { value: "RSSMRA80A01H501U" },
    });
    fireEvent.change(screen.getByLabelText("Password Fisconline"), {
      target: { value: "pw" },
    });
    fireEvent.change(screen.getByLabelText("PIN Fisconline"), {
      target: { value: "1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(
        screen.getByText("L'accesso con SPID non è disponibile."),
      ).toBeInTheDocument(),
    );
  });
});
