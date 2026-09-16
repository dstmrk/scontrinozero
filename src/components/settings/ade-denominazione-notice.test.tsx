import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeDenominazioneNotice } from "./ade-denominazione-notice";
import type { DenominazioneMismatch } from "@/lib/business-identity";
import { ERROR_MESSAGES } from "@/lib/error-messages";

const mockApplyAdeDenominazione = vi.fn();
vi.mock("@/server/profile-actions", () => ({
  applyAdeDenominazione: (id: string) => mockApplyAdeDenominazione(id),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

function renderNotice(mismatch: DenominazioneMismatch | null) {
  return render(
    <AdeDenominazioneNotice businessId={BUSINESS_ID} mismatch={mismatch} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApplyAdeDenominazione.mockResolvedValue({});
});

describe("AdeDenominazioneNotice", () => {
  // Stessa proprietà dell'avviso stale-pending: un blocco che compare sempre
  // smette di essere letto. Qui compare solo quando c'è una divergenza.
  it("non renderizza niente senza divergenza", () => {
    const { container } = renderNotice(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("mette a confronto il nome stampato e quello registrato", () => {
    renderNotice({
      kind: "divergente",
      current: "Mario Rossi",
      ade: "ACME SRL",
    });

    // Il nome registrato compare due volte — nella frase e sul bottone —
    // quindi la query va ancorata all'uno o all'altro.
    expect(
      screen.getByText("Mario Rossi", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ACME SRL", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Usa ACME SRL" }),
    ).toBeInTheDocument();
  });

  it("dice che sullo scontrino non compare nulla quando il nome manca", () => {
    renderNotice({ kind: "assente", current: null, ade: "ACME SRL" });

    expect(screen.getByText(/nessuna ragione sociale/i)).toBeInTheDocument();
    expect(
      screen.getByText("ACME SRL", { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("allinea il nome e aggiorna la pagina", async () => {
    renderNotice({
      kind: "divergente",
      current: "Mario Rossi",
      ade: "ACME SRL",
    });

    fireEvent.click(screen.getByRole("button", { name: /usa/i }));

    await waitFor(() => {
      expect(mockApplyAdeDenominazione).toHaveBeenCalledWith(BUSINESS_ID);
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("mostra l'errore della action senza aggiornare la pagina", async () => {
    mockApplyAdeDenominazione.mockResolvedValue({ error: "Non autenticato." });
    renderNotice({
      kind: "divergente",
      current: "Mario Rossi",
      ade: "ACME SRL",
    });

    fireEvent.click(screen.getByRole("button", { name: /usa/i }));

    expect(await screen.findByText("Non autenticato.")).toBeInTheDocument();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  // Un throw non è un errore d'input: quelli tornano come { error }. Qui è
  // rete o server, e il messaggio deve dire che si può riprovare.
  it("mostra un errore riprovabile se la action lancia", async () => {
    mockApplyAdeDenominazione.mockRejectedValue(new Error("network down"));
    renderNotice({
      kind: "divergente",
      current: "Mario Rossi",
      ade: "ACME SRL",
    });

    fireEvent.click(screen.getByRole("button", { name: /usa/i }));

    expect(
      await screen.findByText(ERROR_MESSAGES.GENERIC_TRANSIENT),
    ).toBeInTheDocument();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  // Il CHECK su business_name è a 120 caratteri, ade_denominazione non ne ha:
  // proporre un bottone che la UPDATE rifiuterebbe è un vicolo cieco.
  it("mostra la divergenza ma non il bottone se il nome non entra in colonna", () => {
    renderNotice({
      kind: "non-applicabile",
      current: "Mario Rossi",
      ade: "A".repeat(121),
    });

    expect(screen.getByText(/Mario Rossi/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("non lascia partire due allineamenti sullo stesso click doppio", async () => {
    let resolveAction: (value: { error?: string }) => void = () => {};
    mockApplyAdeDenominazione.mockReturnValue(
      new Promise<{ error?: string }>((resolve) => {
        resolveAction = resolve;
      }),
    );
    renderNotice({
      kind: "divergente",
      current: "Mario Rossi",
      ade: "ACME SRL",
    });

    const button = screen.getByRole("button", { name: /usa/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);

    expect(mockApplyAdeDenominazione).toHaveBeenCalledTimes(1);
    resolveAction({});
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });
});
