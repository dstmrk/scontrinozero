// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import DashboardError from "./error";

/**
 * Errore lanciato dal server: Next gli attacca `digest` e ne CANCELLA il
 * messaggio prima di passarlo al boundary in produzione. Il digest è quindi
 * l'unica cosa che sopravvive, ed è la chiave per correlare con Sentry.
 */
function serverError(digest = "1234567890"): Error & { digest?: string } {
  return Object.assign(new Error(), { digest });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardError — fallback reso dentro la shell", () => {
  it("rende il messaggio di fallback e il bottone Riprova", () => {
    render(<DashboardError error={serverError()} reset={vi.fn()} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Qualcosa è andato storto/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Riprova/i }),
    ).toBeInTheDocument();
  });

  it("invoca reset() al click su Riprova", () => {
    const reset = vi.fn();
    render(<DashboardError error={serverError()} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: /Riprova/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("mostra il digest come codice di riferimento per il supporto", () => {
    render(<DashboardError error={serverError("abc123def")} reset={vi.fn()} />);

    expect(screen.getByText(/abc123def/)).toBeInTheDocument();
  });

  it("non mostra alcun codice quando il digest manca (errore client)", () => {
    render(<DashboardError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.queryByText(/Codice/i)).not.toBeInTheDocument();
  });

  it("non espone mai il messaggio grezzo dell'errore all'esercente", () => {
    // In dev `error.message` sopravvive: non deve comunque finire a schermo,
    // o il testo mostrato divergerebbe fra dev e produzione.
    render(
      <DashboardError
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
});

describe("DashboardError — cattura Sentry senza doppioni", () => {
  it("NON ri-cattura un errore server: ha già il suo evento da onRequestError", () => {
    render(<DashboardError error={serverError()} reset={vi.fn()} />);

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("cattura l'errore di render client, che nessun altro vedrebbe", () => {
    const clientError = new Error("render crash");

    render(<DashboardError error={clientError} reset={vi.fn()} />);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(clientError);
  });

  it("cattura una sola volta anche se il boundary ri-renderizza sullo stesso errore", () => {
    const clientError = new Error("render crash");
    const { rerender } = render(
      <DashboardError error={clientError} reset={vi.fn()} />,
    );

    rerender(<DashboardError error={clientError} reset={vi.fn()} />);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
