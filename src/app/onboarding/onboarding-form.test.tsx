import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OnboardingForm } from "./onboarding-form";

// --- Mocks ---

const mockVerifyAdeCredentials = vi.fn();
vi.mock("@/server/onboarding-actions", () => ({
  saveBusiness: vi.fn(),
  saveAdeCredentials: vi.fn(),
  verifyAdeCredentials: (id: string, utenzaPiva?: string) =>
    mockVerifyAdeCredentials(id, utenzaPiva),
}));

const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAdeCredentials.mockResolvedValue({});
});

/** Onboarding aperto sull'ultimo step, quello della verifica AdE. */
function renderAtVerifyStep() {
  return render(<OnboardingForm initialStep={2} initialBusinessId="biz-1" />);
}

function clickVerify() {
  fireEvent.click(screen.getByRole("button", { name: "Verifica connessione" }));
}

// --- Tests ---

describe("OnboardingForm — verifica AdE", () => {
  it("verifica senza partita IVA finché non c'è una scelta da fare", async () => {
    renderAtVerifyStep();

    clickVerify();

    await waitFor(() =>
      expect(mockVerifyAdeCredentials).toHaveBeenCalledWith("biz-1", undefined),
    );
  });

  it("porta al pannello quando la verifica riesce", async () => {
    renderAtVerifyStep();

    clickVerify();

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/dashboard"),
    );
  });

  it("mostra l'errore quando la verifica fallisce", async () => {
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "Credenziali Fisconline non valide.",
    });
    renderAtVerifyStep();

    clickVerify();

    expect(
      await screen.findByText("Credenziali Fisconline non valide."),
    ).toBeInTheDocument();
  });
});

describe("OnboardingForm — scelta utenza di lavoro (HAR.md #18)", () => {
  // Il buco che questa suite chiude: il picker esisteva solo in impostazioni.
  // Chi arrivava in onboarding con un'utenza incaricata leggeva "conferma qui
  // sotto la partita IVA" e sotto non c'era niente — vicolo cieco senza uscita,
  // perché l'onboarding è l'unica superficie che un utente nuovo attraversa.
  it("mostra il picker quando l'AdE offre più partite IVA", async () => {
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "Questo accesso può operare su più partite IVA.",
      utenzaChoices: [{ piva: "11111111111" }, { piva: "22222222222" }],
    });
    renderAtVerifyStep();

    clickVerify();

    expect(
      await screen.findByText("Scegli la partita IVA su cui operare"),
    ).toBeInTheDocument();
    expect(screen.getByText("11111111111")).toBeInTheDocument();
    expect(screen.getByText("22222222222")).toBeInTheDocument();
  });

  it("mostra il picker anche con un solo candidato", async () => {
    // Il caso dell'utenza incaricata singola: `direct.length === 0` più un
    // incarico. È quello che ha bloccato il primo esercente arrivato qui.
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "Questo accesso opera per conto di un altro soggetto.",
      utenzaChoices: [{ piva: "11111111111" }],
    });
    renderAtVerifyStep();

    clickVerify();

    expect(
      await screen.findByText("Conferma la partita IVA su cui operare"),
    ).toBeInTheDocument();
  });

  it("ri-verifica passando la partita IVA scelta", async () => {
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "scegli",
      utenzaChoices: [{ piva: "11111111111" }, { piva: "22222222222" }],
    });
    renderAtVerifyStep();

    clickVerify();
    const rows = await screen.findAllByRole("button", { name: "Collega" });
    expect(rows).toHaveLength(2);

    mockVerifyAdeCredentials.mockClear();
    fireEvent.click(rows[1]);

    await waitFor(() =>
      expect(mockVerifyAdeCredentials).toHaveBeenCalledWith(
        "biz-1",
        "22222222222",
      ),
    );
  });

  it("porta al pannello quando la scelta sblocca la verifica", async () => {
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "scegli",
      utenzaChoices: [{ piva: "11111111111" }],
    });
    renderAtVerifyStep();

    clickVerify();
    const confirm = await screen.findByRole("button", { name: "Conferma" });

    mockVerifyAdeCredentials.mockResolvedValue({});
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/dashboard"),
    );
  });

  it("ritira il picker quando il tentativo successivo fallisce per altro", async () => {
    // Senza reset le scelte sopravvivono all'errore che le ha smentite, e
    // l'utente continua a vedere righe cliccabili sotto un messaggio che parla
    // d'altro.
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "scegli",
      utenzaChoices: [{ piva: "11111111111" }, { piva: "22222222222" }],
    });
    renderAtVerifyStep();

    clickVerify();
    const rows = await screen.findAllByRole("button", { name: "Collega" });

    mockVerifyAdeCredentials.mockResolvedValue({
      error: "Il portale non è raggiungibile.",
    });
    fireEvent.click(rows[0]);

    expect(
      await screen.findByText("Il portale non è raggiungibile."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Scegli la partita IVA su cui operare"),
    ).not.toBeInTheDocument();
  });

  it("ritira il picker quando l'utente torna a cambiare le credenziali", async () => {
    // Le righe restavano cliccabili sotto un errore ormai superato, e un clic
    // avrebbe ri-verificato una partita IVA che le nuove credenziali possono
    // non offrire affatto.
    mockVerifyAdeCredentials.mockResolvedValue({
      error: "scegli",
      utenzaChoices: [{ piva: "11111111111" }, { piva: "22222222222" }],
    });
    renderAtVerifyStep();

    clickVerify();
    await screen.findAllByRole("button", { name: "Collega" });

    fireEvent.click(
      screen.getByRole("button", { name: "Modifica credenziali" }),
    );

    expect(
      screen.queryByText("Scegli la partita IVA su cui operare"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("scegli")).not.toBeInTheDocument();
  });

  it("senza scelte da fare non mostra nessun picker", async () => {
    mockVerifyAdeCredentials.mockResolvedValue({ error: "credenziali errate" });
    renderAtVerifyStep();

    clickVerify();

    expect(await screen.findByText("credenziali errate")).toBeInTheDocument();
    expect(
      screen.queryByText("Scegli la partita IVA su cui operare"),
    ).not.toBeInTheDocument();
  });
});
