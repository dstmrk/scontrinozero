import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeCredentialsSection } from "./ade-credentials-section";

// --- Mocks ---

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

    it("mostra il pulsante 'Verifica credenziali'", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Verifica credenziali" }),
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
        screen.getByRole("button", { name: "Verifica credenziali" }),
      );

      await waitFor(() => {
        expect(mockVerifyAdeCredentials).toHaveBeenCalledWith("biz-123");
      });
    });

    it("dopo la verifica riuscita mostra badge 'Verificate' e chiama router.refresh()", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica credenziali" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verificate")).toBeInTheDocument();
      });

      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });

    it("dopo la verifica riuscita nasconde il pulsante", async () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={null}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Verifica credenziali" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verificate")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: "Verifica credenziali" }),
      ).not.toBeInTheDocument();
    });

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
        screen.getByRole("button", { name: "Verifica credenziali" }),
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
        screen.getByRole("button", { name: "Verifica credenziali" }),
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
        screen.getByRole("button", { name: "Verifica credenziali" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Verifica fallita.")).toBeInTheDocument();
      });

      expect(mockRouterRefresh).not.toHaveBeenCalled();
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
        screen.getByRole("button", { name: "Verifica credenziali" }),
      );

      expect(mockVerifyAdeCredentials).not.toHaveBeenCalled();
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

    it("non mostra il pulsante di verifica se già verificate", () => {
      render(
        <AdeCredentialsSection
          businessId="biz-1"
          hasCredentials={true}
          verifiedAt={new Date("2025-01-01")}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Verifica credenziali" }),
      ).not.toBeInTheDocument();
    });
  });
});
