import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptCollaboratorInvite } from "@/server/auth-actions";
import { track, UMAMI_EVENTS } from "@/lib/umami";
import { AcceptInviteForm } from "./accept-invite-form";

const { mockReplace, mockReset } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock("@/server/auth-actions", () => ({
  acceptCollaboratorInvite: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
vi.mock("@/lib/umami", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/umami")>()),
  track: vi.fn(),
}));
// Il widget vero carica lo script di Cloudflare: qui emette subito un token
// ed espone `reset`, come fa il widget risolto.
vi.mock("@/components/turnstile-widget", () => ({
  TurnstileWidget: ({
    onToken,
    action,
    ref,
  }: {
    onToken: (token: string | null) => void;
    action: string;
    ref: { current: unknown };
  }) => {
    useEffect(() => {
      ref.current = { reset: mockReset };
      onToken(`token-${action}`);
    }, [action, onToken, ref]);
    return null;
  },
}));

const TOKEN = "a".repeat(43);

function renderForm() {
  return render(
    <AcceptInviteForm
      token={TOKEN}
      email="anna@example.com"
      businessName="Bar Centrale"
    />,
  );
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Nome e cognome"), {
    target: { value: "Anna Bianchi" },
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
  fireEvent.click(screen.getByRole("button", { name: "Crea il tuo accesso" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(acceptCollaboratorInvite).mockResolvedValue({});
});

describe("AcceptInviteForm", () => {
  it("dice quale attività invita e con quale email si entrerà", () => {
    renderForm();

    expect(screen.getByText("Bar Centrale")).toBeInTheDocument();
    expect(screen.getByText("anna@example.com")).toBeInTheDocument();
  });

  it("linka Termini, Condizioni per i collaboratori e Privacy", () => {
    renderForm();

    expect(
      screen.getByRole("link", { name: "Termini di servizio" }),
    ).toHaveAttribute("href", "/termini");
    expect(
      screen.getByRole("link", { name: "Condizioni per i collaboratori" }),
    ).toHaveAttribute("href", "/condizioni-collaboratori");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("manda token, nome, password, consensi e captcha del flusso d'invito", async () => {
    renderForm();

    fillAndSubmit();

    await waitFor(() => expect(acceptCollaboratorInvite).toHaveBeenCalled());
    const fd = vi.mocked(acceptCollaboratorInvite).mock.calls[0][0];
    expect(Object.fromEntries(fd.entries())).toEqual({
      token: TOKEN,
      name: "Anna Bianchi",
      password: "Secure#99x",
      confirmPassword: "Secure#99x",
      termsAccepted: "true",
      specificClausesAccepted: "true",
      captchaToken: "token-accept-invite",
    });
  });

  it("a invito accettato traccia l'evento dedicato e va al dashboard", async () => {
    renderForm();

    fillAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
    expect(track).toHaveBeenCalledWith(UMAMI_EVENTS.collaboratorInviteAccepted);
  });

  it("su errore lo mostra, non traccia nulla e rinnova il captcha", async () => {
    vi.mocked(acceptCollaboratorInvite).mockResolvedValue({
      error:
        "Questo invito non è più valido: chiedi al titolare di mandartene uno nuovo.",
    });
    renderForm();

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Questo invito non è più valido",
    );
    expect(track).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it("senza i consensi non invia", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Nome e cognome"), {
      target: { value: "Anna Bianchi" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Secure#99x" },
    });
    fireEvent.change(screen.getByLabelText("Conferma password"), {
      target: { value: "Secure#99x" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crea il tuo accesso" }),
    );

    expect(
      await screen.findByText(
        "Devi accettare i Termini, le Condizioni per i collaboratori e la Privacy Policy.",
      ),
    ).toBeInTheDocument();
    expect(acceptCollaboratorInvite).not.toHaveBeenCalled();
  });
});
