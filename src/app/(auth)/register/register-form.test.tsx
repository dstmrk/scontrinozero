import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signUp } from "@/server/auth-actions";
import { RegisterForm } from "./register-form";

vi.mock("@/server/auth-actions", () => ({ signUp: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/turnstile-widget", () => ({
  TurnstileWidget: ({
    onToken,
    action,
  }: {
    onToken: (token: string | null) => void;
    action: string;
  }) => {
    useEffect(() => onToken(`token-${action}`), [action, onToken]);
    return null;
  },
}));

function renderForm() {
  return render(<RegisterForm forcedReferralCode={null} partnerLabel={null} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(signUp).mockResolvedValue({});
});

describe("RegisterForm", () => {
  it("chiede Termini e Privacy e l'approvazione specifica delle clausole", () => {
    renderForm();

    expect(
      screen.getByRole("link", { name: "Termini di servizio" }),
    ).toHaveAttribute("href", "/termini");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByLabelText(/ai sensi dell'art\. 1341 c\.c\./),
    ).toBeInTheDocument();
  });

  it("senza le spunte non registra", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Registrati" }));

    expect(
      await screen.findByText(
        "Devi accettare i Termini di servizio e la Privacy Policy.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Devi accettare specificamente le clausole indicate."),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("con le spunte manda i consensi e il captcha della registrazione", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "mario@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Secure#99x" },
    });
    fireEvent.change(screen.getByLabelText("Conferma password"), {
      target: { value: "Secure#99x" },
    });
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    fireEvent.click(screen.getByRole("button", { name: "Registrati" }));

    await waitFor(() => expect(signUp).toHaveBeenCalled());
    const fd = vi.mocked(signUp).mock.calls[0][0];
    expect(fd.get("termsAccepted")).toBe("true");
    expect(fd.get("specificClausesAccepted")).toBe("true");
    expect(fd.get("captchaToken")).toBe("token-signup");
  });
});
