import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdeCredentialsSection } from "./ade-credentials-section";

// --- Mocks ---

vi.mock("@/components/ade/change-ade-password-dialog", () => ({
  ChangeAdePasswordDialog: () => null,
}));

const mockVerifyAdeCredentials = vi.fn();
vi.mock("@/server/onboarding-actions", () => ({
  verifyAdeCredentials: (id: string) => mockVerifyAdeCredentials(id),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAdeCredentials.mockResolvedValue({});
});

// --- Tests ---

describe("AdeCredentialsSection", () => {
  describe("nessuna credenziale", () => {
    it("mostra il messaggio 'Nessuna credenziale configurata'", () => {
      render(
        <AdeCredentialsSection
          businessId={null}
          hasCredentials={false}
          verifiedAt={null}
        />,
      );

      expect(
        screen.getByText("Nessuna credenziale configurata."),
      ).toBeInTheDocument();
    });

    it("non mostra il badge di stato", () => {
      render(
        <AdeCredentialsSection
          businessId={null}
          hasCredentials={false}
          verifiedAt={null}
        />,
      );

      expect(screen.queryByText("Verificate")).not.toBeInTheDocument();
      expect(screen.queryByText("Non verificate")).not.toBeInTheDocument();
    });
  });

  describe("credenziali non verificate", () => {
    it("mostra badge 'Non verificate'", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      expect(screen.getByText("Non verificate")).toBeInTheDocument();
    });

    it("mostra il pulsante 'Verifica connessione'", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Verifica connessione" }),
      ).toBeInTheDocument();
    });

    it("chiama verifyAdeCredentials con il businessId al click", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-123"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(mockVerifyAdeCredentials).toHaveBeenCalledWith("biz-123");
      });
    });

    it("non fa nulla se businessId è null", () => {
      render(
        <AdeCredentialsSection
          businessId={null}
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      expect(mockVerifyAdeCredentials).not.toHaveBeenCalled();
    });
  });

  describe("stato pending", () => {
    it("disabilita il pulsante durante la verifica", async () => {
      let resolveAction!: (v: unknown) => void;
      mockVerifyAdeCredentials.mockReturnValue(
        new Promise((r) => {
          resolveAction = r;
        }),
      );

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Verifica in corso…" }),
        ).toBeDisabled();
      });

      // Resolve to clean up the pending promise
      resolveAction({});
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Verifica connessione" }),
        ).toBeInTheDocument();
      });
    });

    it("mostra label 'Verifica in corso…' durante la verifica", async () => {
      let resolveAction!: (v: unknown) => void;
      mockVerifyAdeCredentials.mockReturnValue(
        new Promise((r) => {
          resolveAction = r;
        }),
      );

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verifica in corso…")).toBeInTheDocument();
      });

      resolveAction({});
    });
  });

  describe("stato success", () => {
    it("mostra badge 'Verificate' dopo verifica riuscita", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verificate")).toBeInTheDocument();
      });
    });

    it("mostra il testo 'Connessione verificata.' dopo verifica riuscita", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();
      });
    });

    it("il pulsante rimane visibile dopo la verifica riuscita", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();
      });

      expect(
        screen.getByRole("button", { name: "Verifica connessione" }),
      ).toBeInTheDocument();
    });

    it("chiama router.refresh() dopo verifica riuscita", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
      });
    });

    it("non mostra 'Ultima verifica' durante il feedback di successo", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();
      });

      expect(screen.queryByText(/Ultima verifica/)).not.toBeInTheDocument();
    });
  });

  describe("auto-dismiss del feedback di successo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("il feedback scompare dopo 3000ms", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Verifica connessione" }),
        );
      });

      expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(
        screen.queryByText("Connessione verificata."),
      ).not.toBeInTheDocument();
    });

    it("il feedback è ancora visibile a 2999ms", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Verifica connessione" }),
        );
      });

      act(() => {
        vi.advanceTimersByTime(2999);
      });

      expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();
    });

    it("click durante il feedback resetta il timer correttamente", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      // First verification
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Verifica connessione" }),
        );
      });

      expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();

      // Advance 1500ms (mid-success), then click again
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Verifica connessione" }),
        );
      });

      expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();

      // Advance another 3000ms — timer was reset, so success should now dismiss
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(
        screen.queryByText("Connessione verificata."),
      ).not.toBeInTheDocument();
    });
  });

  describe("stato error", () => {
    it("mostra errore se verifyAdeCredentials restituisce un errore", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita. Controlla le credenziali Fisconline.",
      });

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            "Verifica fallita. Controlla le credenziali Fisconline.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("in caso di errore rimane sul badge 'Non verificate'", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita. Controlla le credenziali Fisconline.",
      });

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Non verificate")).toBeInTheDocument();
      });
    });

    it("non chiama router.refresh() se la verifica fallisce", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita.",
      });

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verifica fallita.")).toBeInTheDocument();
      });

      expect(mockRouterRefresh).not.toHaveBeenCalled();
    });

    it("mostra label 'Riprova' dopo un errore", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita.",
      });

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Riprova" }),
        ).toBeInTheDocument();
      });
    });

    it("l'errore persiste dopo 3000ms (non auto-dismiss)", async () => {
      vi.useFakeTimers();

      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita.",
      });

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Verifica connessione" }),
        );
      });

      expect(screen.getByText("Verifica fallita.")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText("Verifica fallita.")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("cliccando 'Riprova' chiama di nuovo verifyAdeCredentials", async () => {
      mockVerifyAdeCredentials.mockResolvedValueOnce({
        error: "Verifica fallita.",
      });
      mockVerifyAdeCredentials.mockResolvedValueOnce({});

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Riprova" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Riprova" }));

      await waitFor(() => {
        expect(mockVerifyAdeCredentials).toHaveBeenCalledTimes(2);
      });
    });

    it("l'errore si cancella quando il secondo tentativo ha successo", async () => {
      mockVerifyAdeCredentials.mockResolvedValueOnce({
        error: "Verifica fallita.",
      });
      mockVerifyAdeCredentials.mockResolvedValueOnce({});

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verifica fallita.")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Riprova" }));

      await waitFor(() => {
        expect(screen.queryByText("Verifica fallita.")).not.toBeInTheDocument();
      });

      expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();
    });
  });

  describe("credenziali già verificate", () => {
    it("mostra badge 'Verificate'", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      expect(screen.getByText("Verificate")).toBeInTheDocument();
    });

    it("mostra il pulsante 'Verifica connessione' anche quando già verificate", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Verifica connessione" }),
      ).toBeInTheDocument();
    });

    it("permette ri-verifica chiamando verifyAdeCredentials", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(mockVerifyAdeCredentials).toHaveBeenCalledWith("biz-1");
      });
    });

    it("il badge rimane 'Verificate' anche se la ri-verifica fallisce", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita.",
      });

      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verifica fallita.")).toBeInTheDocument();
      });

      expect(screen.getByText("Verificate")).toBeInTheDocument();
    });
  });

  describe("Ultima verifica", () => {
    it("mostra la data di ultima verifica quando verifiedAt è non null", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      expect(screen.getByText(/Ultima verifica/)).toBeInTheDocument();
    });

    it("non mostra la data di ultima verifica quando verifiedAt è null", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      expect(screen.queryByText(/Ultima verifica/)).not.toBeInTheDocument();
    });

    it("nasconde la data di ultima verifica durante il feedback di successo", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      expect(screen.getByText(/Ultima verifica/)).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica connessione" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Connessione verificata.")).toBeInTheDocument();
      });

      expect(screen.queryByText(/Ultima verifica/)).not.toBeInTheDocument();
    });
  });
});
