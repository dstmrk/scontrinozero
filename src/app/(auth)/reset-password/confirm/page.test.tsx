import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConfirmPasswordReset } = vi.hoisted(() => ({
  mockConfirmPasswordReset: vi.fn(),
}));

vi.mock("@/server/auth-actions", () => ({
  confirmPasswordReset: mockConfirmPasswordReset,
}));
// Il form ha la sua suite: qui conta se la pagina lo monta e con quale token.
vi.mock("./confirm-reset-form", () => ({
  ConfirmResetForm: ({ tokenHash }: { tokenHash: string }) => (
    <div data-testid="form">{tokenHash}</div>
  ),
}));

import ConfirmResetPage, { metadata } from "./page";

async function renderPage(searchParams: { token_hash?: string | string[] }) {
  render(
    await ConfirmResetPage({ searchParams: Promise.resolve(searchParams) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConfirmResetPage (issue #1159)", () => {
  it("monta il pulsante con il token_hash, senza consumarlo", async () => {
    await renderPage({ token_hash: "hash123" });

    expect(screen.getByTestId("form")).toHaveTextContent("hash123");
    // La GET non tocca Supabase: il token lo consuma solo il clic.
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it.each([
    { name: "assente", params: {} },
    { name: "vuoto", params: { token_hash: "" } },
    { name: "solo spazi", params: { token_hash: "   " } },
    { name: "ripetuto", params: { token_hash: ["a", "b"] } },
  ])("con token_hash $name mostra il link non valido", async ({ params }) => {
    await renderPage(params);

    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    expect(screen.getByText("Link non valido")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Richiedi un nuovo link" }),
    ).toHaveAttribute("href", "/reset-password");
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it("non si indicizza e non passa l'URL col token come referrer", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
