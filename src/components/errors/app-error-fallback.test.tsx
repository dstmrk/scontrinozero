// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCaptureException = vi.fn<(error: unknown) => void>();
const mockFlush = vi.fn<(timeout?: number) => Promise<boolean>>();

vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown) => mockCaptureException(error),
  flush: (timeout?: number) => mockFlush(timeout),
}));

const mockIsDeploySkewError = vi.fn<(error: unknown) => boolean>();
const mockRecoverFromDeploySkew = vi.fn<() => boolean>();
const mockReloadPage = vi.fn<() => void>();

vi.mock("@/lib/deploy-skew", () => ({
  isDeploySkewError: (error: unknown) => mockIsDeploySkewError(error),
  recoverFromDeploySkew: () => mockRecoverFromDeploySkew(),
  reloadPage: () => mockReloadPage(),
}));

import { AppErrorFallback } from "./app-error-fallback";

/**
 * Errore lanciato dal server: Next gli attacca `digest` e ne cancella il
 * messaggio prima di passarlo al boundary in produzione.
 */
function serverError(digest = "1234567890"): Error & { digest?: string } {
  return Object.assign(new Error(), { digest });
}

function skewError(): Error & { digest?: string } {
  return Object.assign(
    new Error('Server Action "40da6925" was not found on the server.'),
    { name: "UnrecognizedActionError" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDeploySkewError.mockReturnValue(false);
  mockRecoverFromDeploySkew.mockReturnValue(true);
  mockFlush.mockResolvedValue(true);
});

describe("AppErrorFallback — guasto generico", () => {
  it("rende il messaggio di fallback e il bottone Riprova", () => {
    render(<AppErrorFallback error={serverError()} reset={vi.fn()} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Qualcosa è andato storto/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Riprova/i }),
    ).toBeInTheDocument();
  });

  it("invoca reset() al click su Riprova", () => {
    const reset = vi.fn();
    render(<AppErrorFallback error={serverError()} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: /Riprova/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("mostra il digest come codice di riferimento per il supporto", () => {
    render(
      <AppErrorFallback error={serverError("abc123def")} reset={vi.fn()} />,
    );

    expect(screen.getByText(/abc123def/)).toBeInTheDocument();
  });

  it("non espone mai il messaggio grezzo dell'errore all'esercente", () => {
    render(
      <AppErrorFallback
        error={Object.assign(
          new Error("ProfileNotFoundError: authUserId=u-1"),
          {
            digest: "d1",
          },
        )}
        reset={vi.fn()}
      />,
    );

    expect(screen.queryByText(/authUserId/)).not.toBeInTheDocument();
  });

  it("NON ri-cattura un errore server: ha già il suo evento da onRequestError", () => {
    render(<AppErrorFallback error={serverError()} reset={vi.fn()} />);

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("cattura l'errore di render client, che nessun altro vedrebbe", () => {
    const clientError = new Error("render crash");

    render(<AppErrorFallback error={clientError} reset={vi.fn()} />);

    expect(mockCaptureException).toHaveBeenCalledExactlyOnceWith(clientError);
  });

  it("cattura una sola volta anche se il boundary ri-renderizza sullo stesso errore", () => {
    const clientError = new Error("render crash");
    const { rerender } = render(
      <AppErrorFallback error={clientError} reset={vi.fn()} />,
    );

    rerender(<AppErrorFallback error={clientError} reset={vi.fn()} />);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("non tocca il recupero da deploy skew su un errore che non è skew", () => {
    render(<AppErrorFallback error={new Error("boom")} reset={vi.fn()} />);

    expect(mockRecoverFromDeploySkew).not.toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
  });
});

describe("AppErrorFallback — deploy skew", () => {
  beforeEach(() => {
    mockIsDeploySkewError.mockReturnValue(true);
  });

  it("annuncia l'aggiornamento invece del guasto generico", () => {
    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    expect(screen.getByText(/nuova versione/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Qualcosa è andato storto/i),
    ).not.toBeInTheDocument();
  });

  it("rassicura che l'operazione non è stata registrata: il server ha rifiutato la chiamata", () => {
    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    expect(screen.getByText(/non è stata registrata/i)).toBeInTheDocument();
  });

  it("NON offre Riprova: il bundle vecchio è ancora in memoria, ri-renderizzare non risolve", () => {
    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /Riprova/i }),
    ).not.toBeInTheDocument();
  });

  it("ricarica la pagina dopo aver svuotato la coda Sentry", async () => {
    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    await waitFor(() =>
      expect(mockRecoverFromDeploySkew).toHaveBeenCalledTimes(1),
    );
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it("ricarica comunque se il flush Sentry fallisce", async () => {
    mockFlush.mockRejectedValue(new Error("transport down"));

    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    await waitFor(() =>
      expect(mockRecoverFromDeploySkew).toHaveBeenCalledTimes(1),
    );
  });

  it("manda comunque l'evento a Sentry: è l'unica misura di quanti utenti prende lo skew", () => {
    const error = skewError();

    render(<AppErrorFallback error={error} reset={vi.fn()} />);

    expect(mockCaptureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("offre il ricarico manuale quando un reload è già stato tentato da poco", async () => {
    mockRecoverFromDeploySkew.mockReturnValue(false);

    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    const button = await screen.findByRole("button", {
      name: /Ricarica la pagina/i,
    });
    fireEvent.click(button);

    expect(mockReloadPage).toHaveBeenCalledTimes(1);
  });

  it("non ricarica se il boundary è già stato smontato quando il flush risolve", async () => {
    // Una navigazione (o il reset del boundary) mentre aspettiamo Sentry: il
    // reload strapperebbe la pagina nuova sotto ai piedi dell'utente.
    let resolveFlush: (value: boolean) => void = () => undefined;
    mockFlush.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveFlush = resolve;
      }),
    );

    const { unmount } = render(
      <AppErrorFallback error={skewError()} reset={vi.fn()} />,
    );
    unmount();
    resolveFlush(true);
    await Promise.resolve();

    expect(mockRecoverFromDeploySkew).not.toHaveBeenCalled();
  });

  it("non mostra il bottone manuale finché il reload automatico è in corso", () => {
    render(<AppErrorFallback error={skewError()} reset={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /Ricarica la pagina/i }),
    ).not.toBeInTheDocument();
  });
});
