import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeIdentityNotice } from "./ade-identity-notice";
import type {
  DenominazioneMismatch,
  SedeLegaleMismatch,
} from "@/lib/business-identity";
import { ERROR_MESSAGES } from "@/lib/error-messages";

const mockApplyAdeDenominazione = vi.fn();
const mockApplyAdeSedeLegale = vi.fn();
vi.mock("@/server/profile-actions", () => ({
  applyAdeDenominazione: (id: string) => mockApplyAdeDenominazione(id),
  applyAdeSedeLegale: (id: string) => mockApplyAdeSedeLegale(id),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

const DENOMINAZIONE: DenominazioneMismatch = {
  kind: "divergente",
  current: "Mario Rossi",
  ade: "ACME SRL",
};

const SEDE: SedeLegaleMismatch = {
  kind: "divergente",
  fields: [
    { label: "Comune", current: "Roma", ade: "Milano" },
    { label: "CAP", current: null, ade: "20100" },
  ],
  patch: { city: "Milano", zipCode: "20100" },
};

function renderNotice({
  denominazione = null,
  sedeLegale = null,
}: {
  denominazione?: DenominazioneMismatch | null;
  sedeLegale?: SedeLegaleMismatch | null;
} = {}) {
  return render(
    <AdeIdentityNotice
      businessId={BUSINESS_ID}
      denominazione={denominazione}
      sedeLegale={sedeLegale}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApplyAdeDenominazione.mockResolvedValue({});
  mockApplyAdeSedeLegale.mockResolvedValue({});
});

describe("AdeIdentityNotice", () => {
  // Stessa proprietà dell'avviso stale-pending: un blocco che compare sempre
  // smette di essere letto. Qui compare solo quando c'è una divergenza.
  it("non renderizza niente senza divergenze", () => {
    const { container } = renderNotice();
    expect(container).toBeEmptyDOMElement();
  });

  describe("ragione sociale", () => {
    it("mette a confronto il nome stampato e quello registrato", () => {
      renderNotice({ denominazione: DENOMINAZIONE });

      // Il nome registrato compare due volte — nella frase e sul bottone —
      // quindi la query va ancorata all'uno o all'altro.
      expect(
        screen.getByText("Mario Rossi", { selector: "strong" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Usa ACME SRL" }),
      ).toBeInTheDocument();
    });

    it("dice che sullo scontrino non compare nulla quando il nome manca", () => {
      renderNotice({
        denominazione: { ...DENOMINAZIONE, kind: "assente", current: null },
      });

      expect(screen.getByText(/nessuna ragione sociale/i)).toBeInTheDocument();
    });

    it("allinea il nome e aggiorna la pagina", async () => {
      renderNotice({ denominazione: DENOMINAZIONE });

      fireEvent.click(screen.getByRole("button", { name: /usa ACME/i }));

      await waitFor(() =>
        expect(mockApplyAdeDenominazione).toHaveBeenCalledWith(BUSINESS_ID),
      );
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("mostra l'errore della action senza aggiornare la pagina", async () => {
      mockApplyAdeDenominazione.mockResolvedValue({
        error: "Non autenticato.",
      });
      renderNotice({ denominazione: DENOMINAZIONE });

      fireEvent.click(screen.getByRole("button", { name: /usa ACME/i }));

      expect(await screen.findByText("Non autenticato.")).toBeInTheDocument();
      expect(mockRouterRefresh).not.toHaveBeenCalled();
    });

    // Un throw non è un errore d'input: quelli tornano come { error }. Qui è
    // rete o server, e il messaggio deve dire che si può riprovare.
    it("mostra un errore riprovabile se la action lancia", async () => {
      mockApplyAdeDenominazione.mockRejectedValue(new Error("network down"));
      renderNotice({ denominazione: DENOMINAZIONE });

      fireEvent.click(screen.getByRole("button", { name: /usa ACME/i }));

      expect(
        await screen.findByText(ERROR_MESSAGES.GENERIC_TRANSIENT),
      ).toBeInTheDocument();
    });

    // Il CHECK su business_name è a 120 caratteri, ade_denominazione non ne ha:
    // proporre un bottone che la UPDATE rifiuterebbe è un vicolo cieco.
    it("mostra la divergenza ma non il bottone se il nome non entra in colonna", () => {
      renderNotice({
        denominazione: {
          kind: "non-applicabile",
          current: "Mario Rossi",
          ade: "A".repeat(121),
        },
      });

      expect(
        screen.getByText("Mario Rossi", { selector: "strong" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("non lascia partire due allineamenti sullo stesso click doppio", async () => {
      let resolveAction: (value: { error?: string }) => void = () => {};
      mockApplyAdeDenominazione.mockReturnValue(
        new Promise<{ error?: string }>((resolve) => {
          resolveAction = resolve;
        }),
      );
      renderNotice({ denominazione: DENOMINAZIONE });

      const button = screen.getByRole("button", { name: /usa ACME/i });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);

      expect(mockApplyAdeDenominazione).toHaveBeenCalledTimes(1);
      resolveAction({});
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });
  });

  describe("sede legale", () => {
    it("elenca i campi divergenti, campo per campo", () => {
      renderNotice({ sedeLegale: SEDE });

      expect(screen.getByText("Comune")).toBeInTheDocument();
      expect(screen.getByText(/Roma/)).toBeInTheDocument();
      expect(screen.getByText("CAP")).toBeInTheDocument();
      expect(screen.getByText(/non impostato/)).toBeInTheDocument();
    });

    // Divergere qui è spesso legittimo: il testo non deve dire che è un errore.
    it("dice che l'indirizzo può restare com'è se si vende altrove", () => {
      renderNotice({ sedeLegale: SEDE });

      expect(screen.getByText(/vendi altrove/i)).toBeInTheDocument();
    });

    it("allinea l'indirizzo e aggiorna la pagina", async () => {
      renderNotice({ sedeLegale: SEDE });

      fireEvent.click(
        screen.getByRole("button", { name: /usa la sede legale/i }),
      );

      await waitFor(() =>
        expect(mockApplyAdeSedeLegale).toHaveBeenCalledWith(BUSINESS_ID),
      );
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("mostra la divergenza ma non il bottone se non è salvabile", () => {
      renderNotice({
        sedeLegale: { ...SEDE, kind: "non-applicabile", patch: null },
      });

      expect(screen.getByText(/a mano/i)).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  // I due blocchi sono indipendenti: chi vuole il nome della società ma tiene
  // il proprio indirizzo di vendita deve poterlo fare in un click solo.
  it("offre due bottoni distinti quando divergono entrambe", async () => {
    renderNotice({ denominazione: DENOMINAZIONE, sedeLegale: SEDE });

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /usa ACME/i }));

    await waitFor(() =>
      expect(mockApplyAdeDenominazione).toHaveBeenCalledWith(BUSINESS_ID),
    );
    expect(mockApplyAdeSedeLegale).not.toHaveBeenCalled();
  });
});
