import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockResendConfirmationEmail = vi.fn();
vi.mock("@/server/auth-actions", () => ({
  resendConfirmationEmail: mockResendConfirmationEmail,
}));

/**
 * Turnstile disabilitato: il widget non si monta ed emette subito il token
 * sentinella, così il submit (gated su `captchaToken === null`) è abilitato
 * senza dover simulare la challenge. Stesso bypass che usano dev e sandbox.
 */
function renderPage() {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_DISABLED", "true");
  return import("./page").then(({ default: VerifyEmailPage }) =>
    render(<VerifyEmailPage />),
  );
}

function emailField() {
  return screen.getByLabelText(/email/i);
}

function submitButton() {
  return screen.getByRole("button", { name: /reinvia/i });
}

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    mockResendConfirmationEmail.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offre il re-invio della conferma direttamente dalla pagina", async () => {
    // Il buco che ha bloccato un utente reale: la conferma si poteva rispedire
    // solo tornando al login e sbagliando l'accesso di proposito. Chi atterra
    // qui dopo la registrazione deve poterlo fare senza uscire dalla pagina.
    await renderPage();

    expect(emailField()).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
  });

  it("dice di controllare anche la quarantena, non solo lo spam", async () => {
    // Su Exchange Online il messaggio filtrato non finisce in Posta
    // indesiderata ma in quarantena, dove l'utente non lo vede affatto:
    // mandarlo a guardare solo lo spam lo lascia a cercare nel posto sbagliato.
    await renderPage();

    const testo = document.body.textContent ?? "";
    expect(testo).toMatch(/spam/i);
    expect(testo).toMatch(/quarantena/i);
  });

  it("invia email e captcha alla server action al submit", async () => {
    mockResendConfirmationEmail.mockResolvedValue(undefined);
    await renderPage();

    fireEvent.change(emailField(), {
      target: { value: "info@esempio.it" },
    });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(mockResendConfirmationEmail).toHaveBeenCalledTimes(1);
    });

    const inviata = mockResendConfirmationEmail.mock.calls[0][0] as FormData;
    expect(inviata.get("email")).toBe("info@esempio.it");
    expect(inviata.get("captchaToken")).toBe("dev-captcha-disabled");
  });

  it("non chiama la server action con un'email non valida", async () => {
    await renderPage();

    fireEvent.change(emailField(), { target: { value: "non-una-email" } });
    fireEvent.click(submitButton());

    // L'errore di campo (zod) marca il control con aria-invalid e rende il
    // messaggio: shadcn non usa role="alert", quello è riservato all'errore
    // root che arriva dalla server action.
    await waitFor(() => {
      expect(emailField()).toHaveAttribute("aria-invalid", "true");
    });
    expect(screen.getByText(/email valida/i)).toBeInTheDocument();
    expect(mockResendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("mostra l'errore restituito dalla server action", async () => {
    // Caso reale: rate-limit superato. Il messaggio deve restare visibile,
    // altrimenti il submit sembra andato a buon fine e l'utente aspetta.
    mockResendConfirmationEmail.mockResolvedValue({
      error: "Troppi tentativi. Riprova più tardi.",
    });
    await renderPage();

    fireEvent.change(emailField(), {
      target: { value: "info@esempio.it" },
    });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/troppi tentativi/i);
    });
  });

  it("tiene il link al login per chi ha già confermato", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: /accedi|login/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
