// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCaptureException = vi.fn<(error: unknown) => void>();
const mockFlush = vi.fn<(timeout?: number) => Promise<boolean>>();

vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown) => mockCaptureException(error),
  flush: (timeout?: number) => mockFlush(timeout),
}));

import AppError from "./error";

beforeEach(() => {
  vi.clearAllMocks();
  mockFlush.mockResolvedValue(true);
});

describe("AppError — boundary della root", () => {
  it("rende il fallback condiviso al posto del <h2> nudo di global-error", () => {
    render(<AppError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByText(/Qualcosa è andato storto/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Riprova/i }),
    ).toBeInTheDocument();
  });

  it("cattura in Sentry l'errore client, che qui nessun altro vedrebbe", () => {
    const error = new Error("boom");

    render(<AppError error={error} reset={vi.fn()} />);

    expect(mockCaptureException).toHaveBeenCalledExactlyOnceWith(error);
  });
});
