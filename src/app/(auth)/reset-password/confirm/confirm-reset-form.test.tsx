import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConfirmPasswordReset } = vi.hoisted(() => ({
  mockConfirmPasswordReset: vi.fn(),
}));

vi.mock("@/server/auth-actions", () => ({
  confirmPasswordReset: mockConfirmPasswordReset,
}));

import { ConfirmResetForm } from "./confirm-reset-form";

beforeEach(() => {
  vi.clearAllMocks();
});

function clickConfirm() {
  fireEvent.click(
    screen.getByRole("button", { name: "Imposta una nuova password" }),
  );
}

describe("ConfirmResetForm", () => {
  it("al clic manda il token_hash a confirmPasswordReset", async () => {
    mockConfirmPasswordReset.mockResolvedValue(undefined);
    render(<ConfirmResetForm tokenHash="hash123" />);

    clickConfirm();

    await waitFor(() =>
      expect(mockConfirmPasswordReset).toHaveBeenCalledOnce(),
    );
    const [formData] = mockConfirmPasswordReset.mock.calls[0] as [FormData];
    expect(formData.get("tokenHash")).toBe("hash123");
  });

  it("disabilita il pulsante mentre la verifica è in corso", async () => {
    // Promise risolta a fine test: React 19 lega fra loro le transition
    // async ancora aperte, e una mai risolta lascerebbe in pending i test
    // successivi.
    let settle: (value: undefined) => void = () => {};
    mockConfirmPasswordReset.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    render(<ConfirmResetForm tokenHash="hash123" />);

    clickConfirm();

    expect(
      await screen.findByRole("button", { name: "Verifica in corso…" }),
    ).toBeDisabled();
    settle(undefined);
    expect(
      await screen.findByRole("button", { name: "Imposta una nuova password" }),
    ).toBeEnabled();
  });

  it("mostra l'errore e lascia riprovare", async () => {
    mockConfirmPasswordReset.mockResolvedValue({
      error: "Non siamo riusciti a verificare il link. Riprova tra poco.",
    });
    render(<ConfirmResetForm tokenHash="hash123" />);

    clickConfirm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Non siamo riusciti a verificare il link. Riprova tra poco.",
    );
    expect(
      await screen.findByRole("button", { name: "Imposta una nuova password" }),
    ).toBeEnabled();
  });
});
