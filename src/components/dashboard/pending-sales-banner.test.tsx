import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerify, mockConfirm, mockRefresh } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockConfirm: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("@/server/pending-actions", () => ({
  verifyPendingDocument: mockVerify,
  confirmPendingDocument: mockConfirm,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { PendingSalesBanner } from "./pending-sales-banner";

const BIZ = "biz-uuid";
const DOC = "doc-uuid";

const ONE_DOC = [
  { id: DOC, createdAt: "2026-09-10T09:00:00.000Z", totalCents: 1250 },
];

function renderBanner(documents = ONE_DOC) {
  return render(<PendingSalesBanner businessId={BIZ} documents={documents} />);
}

describe("PendingSalesBanner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("non rende nulla senza scontrini in sospeso", () => {
    const { container } = renderBanner([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra importo e ora di ogni scontrino in sospeso", () => {
    renderBanner();

    // 09:00 UTC = 11:00 a Roma in settembre: il fuso è fissato per non far
    // divergere HTML server e idratazione.
    expect(screen.getByRole("alert").textContent).toContain("12,50");
    expect(screen.getByRole("alert").textContent).toContain(
      "10/09/2026, 11:00",
    );
  });

  it("concorda l'intera frase al singolare con un solo scontrino", () => {
    renderBanner();

    // Non solo la prima metà: con la seconda fissa al plurale si leggeva
    // "Uno scontrino non ha ricevuto conferma… Verifica se sono stati
    // registrati prima di riemetterli".
    expect(screen.getByRole("alert").textContent).toContain(
      "Uno scontrino non ha ricevuto conferma dall'Agenzia delle Entrate. Verifica se è stato registrato prima di riemetterlo.",
    );
  });

  it("concorda l'intera frase al plurale da due scontrini in su", () => {
    renderBanner([
      ...ONE_DOC,
      { id: "doc-2", createdAt: "2026-09-10T10:00:00.000Z", totalCents: 500 },
    ]);

    expect(screen.getByRole("alert").textContent).toContain(
      "2 scontrini non hanno ricevuto conferma dall'Agenzia delle Entrate. Verifica se sono stati registrati prima di riemetterli.",
    );
  });

  it("conta gli scontrini quando sono più di uno", () => {
    renderBanner([
      ...ONE_DOC,
      { id: "doc-2", createdAt: "2026-09-10T10:00:00.000Z", totalCents: 500 },
    ]);

    expect(screen.getByRole("alert").textContent).toContain("2 scontrini");
  });

  it("dice di non riemettere quando AdE aveva già registrato", async () => {
    mockVerify.mockResolvedValue({ outcome: "accepted", documentId: DOC });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Non riemetterlo",
      ),
    );
    expect(mockVerify).toHaveBeenCalledWith(BIZ, DOC);
  });

  it("ricarica i dati dopo un esito che chiude la riga", async () => {
    mockVerify.mockResolvedValue({ outcome: "accepted", documentId: DOC });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("invita a riemettere quando AdE non ha nulla", async () => {
    mockVerify.mockResolvedValue({
      outcome: "not-registered",
      documentId: DOC,
    });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Riemetti lo scontrino",
      ),
    );
  });

  it("mostra i candidati e lascia scegliere invece di decidere da sé", async () => {
    mockVerify.mockResolvedValue({
      outcome: "ambiguous",
      documentId: DOC,
      candidates: [
        {
          idtrx: "IDTRX-1",
          numeroProgressivo: "DCW2026/1-1",
          data: "10/09/2026 11:01:00",
          totalCents: 1250,
        },
        {
          idtrx: "IDTRX-2",
          numeroProgressivo: "DCW2026/1-2",
          data: "10/09/2026 11:05:00",
          totalCents: 1250,
        },
      ],
    });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /è questo/i })).toHaveLength(
        2,
      ),
    );
    expect(screen.getByRole("alert").textContent).toContain("DCW2026/1-1");
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("conferma il candidato che l'esercente riconosce", async () => {
    mockVerify.mockResolvedValue({
      outcome: "ambiguous",
      documentId: DOC,
      candidates: [
        {
          idtrx: "IDTRX-1",
          numeroProgressivo: "DCW2026/1-1",
          data: "10/09/2026 11:01:00",
          totalCents: 1250,
        },
      ],
    });
    mockConfirm.mockResolvedValue({ outcome: "accepted", documentId: DOC });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));
    fireEvent.click(await screen.findByRole("button", { name: /è questo/i }));

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(BIZ, DOC, "IDTRX-1"),
    );
  });

  it("avverte di non confermare un documento che non si riconosce", async () => {
    mockVerify.mockResolvedValue({
      outcome: "ambiguous",
      documentId: DOC,
      candidates: [
        {
          idtrx: "IDTRX-1",
          numeroProgressivo: "DCW2026/1-1",
          data: "10/09/2026 11:01:00",
          totalCents: 1250,
        },
      ],
    });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    expect(
      (await screen.findByText(/non riconosci nessuno/i)).textContent,
    ).toContain("riemetti lo scontrino dalla cassa");
  });

  it("mostra l'errore quando AdE non risponde, senza chiudere la riga", async () => {
    mockVerify.mockResolvedValue({
      error: "Agenzia delle Entrate non raggiungibile.",
    });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "non raggiungibile",
      ),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("dice di riprovare quando la riga è ancora in elaborazione", async () => {
    mockVerify.mockResolvedValue({ outcome: "in-progress" });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "ancora in elaborazione",
      ),
    );
  });

  it("chiude la scelta fra candidati dopo una conferma riuscita", async () => {
    mockVerify.mockResolvedValue({
      outcome: "ambiguous",
      documentId: DOC,
      candidates: [
        {
          idtrx: "IDTRX-1",
          numeroProgressivo: "DCW2026/1-1",
          data: "10/09/2026 11:01:00",
          totalCents: 1250,
        },
      ],
    });
    mockConfirm.mockResolvedValue({ outcome: "accepted", documentId: DOC });
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /verifica/i }));
    fireEvent.click(await screen.findByRole("button", { name: /è questo/i }));

    // Attende la comparsa del messaggio, non la sparizione dei candidati:
    // `applyResult` azzera i candidati e scrive il messaggio nello stesso
    // aggiornamento di stato, quindi quando il messaggio è nel DOM la lista è
    // già sparita. Aspettare direttamente l'assenza significherebbe correre
    // contro il timeout di default di `waitFor` (1s) su una transizione — ed è
    // il tipo di test che diventa rosso su un runner CI carico, non sul codice.
    expect(await screen.findByRole("status")).toHaveTextContent(
      /non riemetterlo/i,
    );
    expect(
      screen.queryByRole("button", { name: /è questo/i }),
    ).not.toBeInTheDocument();
  });
});
