import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeReauthBanner } from "./ade-reauth-banner";

// --- Mocks ---

const mockVerifyAdeCredentials = vi.fn();
vi.mock("@/server/onboarding-actions", () => ({
  verifyAdeCredentials: (id: string) => mockVerifyAdeCredentials(id),
}));

let mockNative = false;
vi.mock("@/lib/native/native-shell", () => ({
  useIsNativeShell: () => mockNative,
}));

// Il pulsante vero apre l'InAppBrowser: qui basta sapere che c'è e che, a
// collegamento riuscito, richiama `onConnected`.
vi.mock("@/components/ade/spid-connect-button", () => ({
  SpidConnectButton: (props: {
    businessId: string;
    label?: string;
    onConnected?: () => void;
  }) => (
    <button
      type="button"
      data-business={props.businessId}
      onClick={() => props.onConnected?.()}
    >
      {props.label}
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockNative = false;
  mockVerifyAdeCredentials.mockResolvedValue({ businessId: "biz-1" });
});

// --- Tests ---

describe("AdeReauthBanner", () => {
  describe("stato idle", () => {
    it("mostra il messaggio di sessione scaduta", () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      expect(screen.getByText(/Sessione CIE scaduta/i)).toBeInTheDocument();
    });

    it("mostra il pulsante 'Ricollega'", () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      expect(
        screen.getByRole("button", { name: "Ricollega" }),
      ).toBeInTheDocument();
    });

    it("offre un link di fallback alle impostazioni", () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      expect(
        screen.getByRole("link", { name: /impostazioni/i }),
      ).toHaveAttribute("href", "/dashboard/settings");
    });

    it("chiama verifyAdeCredentials con il businessId al click su 'Ricollega'", async () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-42"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(mockVerifyAdeCredentials).toHaveBeenCalledWith("biz-42");
      });
    });
  });

  describe("stato pending", () => {
    it("mostra il messaggio 'Approva ... la notifica' durante il collegamento", async () => {
      let resolveAction!: (v: unknown) => void;
      mockVerifyAdeCredentials.mockReturnValue(
        new Promise((r) => {
          resolveAction = r;
        }),
      );

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(screen.getByText(/Approva.*notifica/i)).toBeInTheDocument();
      });

      resolveAction({ businessId: "biz-1" });
    });

    it("disabilita il pulsante durante il collegamento", async () => {
      let resolveAction!: (v: unknown) => void;
      mockVerifyAdeCredentials.mockReturnValue(
        new Promise((r) => {
          resolveAction = r;
        }),
      );

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Ricollegamento in corso/i }),
        ).toBeDisabled();
      });

      resolveAction({ businessId: "biz-1" });
    });
  });

  describe("stato success", () => {
    it("mostra il messaggio con l'actionLabel dopo il ricollegamento", async () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(screen.getByText(/Ricollegato/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Emetti scontrino/)).toBeInTheDocument();
    });

    it("usa l'actionLabel dell'annullo quando passato", async () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Annulla scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(screen.getByText(/Annulla scontrino/)).toBeInTheDocument();
      });
    });

    it("invoca onReconnected dopo il ricollegamento riuscito", async () => {
      const onReconnected = vi.fn();
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
          onReconnected={onReconnected}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(onReconnected).toHaveBeenCalledTimes(1);
      });
    });

    it("il pulsante 'OK' chiude il banner di successo tornando a idle", async () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "OK" }));

      expect(screen.queryByText(/Ricollegato/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Ricollega" }),
      ).toBeInTheDocument();
    });
  });

  describe("stato error", () => {
    it("mostra il messaggio d'errore restituito dalla server action", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({
        error: "Verifica fallita. Controlla le credenziali CIE.",
      });

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(
          screen.getByText("Verifica fallita. Controlla le credenziali CIE."),
        ).toBeInTheDocument();
      });
    });

    it("mostra 'Riprova' dopo un errore", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({ error: "Errore." });

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Riprova" }),
        ).toBeInTheDocument();
      });
    });

    it("cliccando 'Riprova' richiama verifyAdeCredentials", async () => {
      mockVerifyAdeCredentials.mockResolvedValueOnce({ error: "Errore." });
      mockVerifyAdeCredentials.mockResolvedValueOnce({ businessId: "biz-1" });

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

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

    it("un secondo tentativo riuscito cancella l'errore e mostra il successo", async () => {
      mockVerifyAdeCredentials.mockResolvedValueOnce({ error: "Errore." });
      mockVerifyAdeCredentials.mockResolvedValueOnce({ businessId: "biz-1" });

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(screen.getByText("Errore.")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Riprova" }));

      await waitFor(() => {
        expect(screen.queryByText("Errore.")).not.toBeInTheDocument();
      });
      expect(screen.getByText(/Ricollegato/i)).toBeInTheDocument();
    });

    it("non invoca onReconnected se il collegamento fallisce", async () => {
      mockVerifyAdeCredentials.mockResolvedValue({ error: "Errore." });
      const onReconnected = vi.fn();

      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
          onReconnected={onReconnected}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      await waitFor(() => {
        expect(screen.getByText("Errore.")).toBeInTheDocument();
      });
      expect(onReconnected).not.toHaveBeenCalled();
    });
  });

  describe("dark mode", () => {
    it("il banner idle porta varianti dark:", () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      const banner = screen.getByText(/Sessione CIE scaduta/i).closest("div");
      expect(banner?.className).toMatch(/dark:/);
    });

    it("il banner di successo porta varianti dark:", async () => {
      render(
        <AdeReauthBanner
          method="cie"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));

      const banner = await screen.findByText(/Ricollegato/i);
      expect(banner.closest("output")?.className).toMatch(/dark:/);
    });
  });

  describe("SPID", () => {
    it("nell'app chiede un nuovo accesso SPID, non la notifica CIE", () => {
      mockNative = true;
      render(
        <AdeReauthBanner
          method="spid"
          businessId="biz-7"
          actionLabel="Emetti scontrino"
        />,
      );

      expect(screen.getByText(/Sessione SPID scaduta/i)).toBeInTheDocument();
      expect(screen.queryByText(/CIE/)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Ricollega con SPID" }),
      ).toHaveAttribute("data-business", "biz-7");
    });

    it("nell'app, collegamento riuscito → successo e onReconnected", () => {
      mockNative = true;
      const onReconnected = vi.fn();
      render(
        <AdeReauthBanner
          method="spid"
          businessId="biz-1"
          actionLabel="Annulla scontrino"
          onReconnected={onReconnected}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Ricollega con SPID" }),
      );

      expect(
        screen.getByText("Ricollegato! Premi di nuovo «Annulla scontrino»."),
      ).toBeInTheDocument();
      expect(onReconnected).toHaveBeenCalledOnce();
      expect(mockVerifyAdeCredentials).not.toHaveBeenCalled();
    });

    it("nel browser rimanda all'app, senza pulsanti che lì non funzionano", () => {
      render(
        <AdeReauthBanner
          method="spid"
          businessId="biz-1"
          actionLabel="Emetti scontrino"
        />,
      );

      expect(
        screen.getByText(
          "Sessione SPID scaduta: ricollegati con SPID dall'app ScontrinoZero, poi riprova.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
