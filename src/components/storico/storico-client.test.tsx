import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { StoricoClient } from "./storico-client";
import { getReceiptDetail, searchReceipts } from "@/server/storico-actions";
import type { ReceiptListItem } from "@/types/storico";

vi.mock("@/server/storico-actions", () => ({
  searchReceipts: vi.fn(),
  getReceiptDetail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// L'export CSV ha il suo gate di piano e la sua suite: qui e' rumore.
vi.mock("@/app/dashboard/storico/export-csv-button", () => ({
  ExportCsvButton: () => <button type="button">Esporta CSV</button>,
}));

/**
 * Stub della modale: espone cosa il dettaglio saprebbe offrire con la riga che
 * gli viene passata. E' esattamente il punto della regressione — la modale
 * riaperta riceveva una riga annullata ma senza `voidDocument`, quindi senza
 * ricevuta di annullamento ne' stampa.
 */
vi.mock("./void-receipt-dialog", () => ({
  VoidReceiptDialog: ({
    receipt,
    onSuccess,
    onClose,
  }: {
    receipt: ReceiptListItem;
    onSuccess: (result: { error?: string }, originalId: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="dialog">
      <span data-testid="dialog-status">{receipt.status}</span>
      <span data-testid="dialog-void-doc">
        {receipt.voidDocument?.id ?? "nessuno"}
      </span>
      <button type="button" onClick={onClose}>
        Chiudi modale
      </button>
      <button type="button" onClick={() => onSuccess({}, receipt.id)}>
        Conferma annullo
      </button>
      <button
        type="button"
        onClick={() => onSuccess({ error: "Rifiutato dall'AdE." }, receipt.id)}
      >
        Annullo fallito
      </button>
    </div>
  ),
}));

const ACCEPTED_ROW: ReceiptListItem = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/5111-2188",
  adeTransactionId: "trx-001",
  createdAt: new Date("2026-02-15T09:59:57Z"),
  adeRegisteredAt: new Date("2026-02-15T10:00:00Z"),
  voidDocument: null,
  paymentMethod: "PC",
  payments: null,
  lotteryCode: null,
  globalDiscountCents: 0,
  total: "12.00",
  lines: [
    {
      description: "Caffè",
      quantity: "2",
      grossUnitPrice: "6.00",
      lineDiscount: "0",
      vatCode: "22",
    },
  ],
};

const VOIDED_ROW: ReceiptListItem = {
  ...ACCEPTED_ROW,
  status: "VOID_ACCEPTED",
  voidDocument: {
    id: "void-doc-uuid",
    adeProgressive: "DCW2026/5111-2189",
    adeRegisteredAt: new Date("2026-02-16T09:15:00Z"),
  },
};

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

function renderStorico() {
  return render(
    <StoricoClient
      businessId={BUSINESS_ID}
      initialItems={[ACCEPTED_ROW]}
      initialTotal={1}
      plan="pro"
    />,
  );
}

/**
 * Apre la modale sulla riga e conferma l'annullo. La modale NON si chiude: e'
 * il momento in cui il cliente e' al banco e aspetta la ricevuta di
 * annullamento.
 */
function voidFromDialog() {
  fireEvent.click(screen.getByText("5111-2188"));
  fireEvent.click(screen.getByText("Conferma annullo"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchReceipts).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(getReceiptDetail).mockResolvedValue({ item: VOIDED_ROW });
});

describe("StoricoClient — riga rileggibile dopo l'annullo", () => {
  it("rilegge dal server la riga annullata", async () => {
    renderStorico();

    fireEvent.click(screen.getByText("5111-2188"));
    fireEvent.click(screen.getByText("Conferma annullo"));

    await waitFor(() =>
      expect(getReceiptDetail).toHaveBeenCalledWith(
        BUSINESS_ID,
        ACCEPTED_ROW.id,
      ),
    );
  });

  it("tiene la modale aperta dopo l'annullo", async () => {
    renderStorico();

    voidFromDialog();

    // La modale smontata portava con se' la schermata "Annullo confermato" e
    // ogni accesso alla ricevuta di annullamento: l'esercente doveva chiudere,
    // ritrovare la riga e riaprirla proprio mentre il cliente aspetta.
    await waitFor(() =>
      expect(screen.getByTestId("dialog-void-doc")).toHaveTextContent(
        "void-doc-uuid",
      ),
    );
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });

  it("porta l'annullo appena creato nella modale aperta, senza rifare la ricerca", async () => {
    renderStorico();

    voidFromDialog();

    // Il cuore della regressione: la riga aggiornata in modo ottimistico
    // portava solo lo status, e il dettaglio non aveva ne' la ricevuta di
    // annullamento ne' la stampa.
    await waitFor(() =>
      expect(screen.getByTestId("dialog-void-doc")).toHaveTextContent(
        "void-doc-uuid",
      ),
    );
    expect(searchReceipts).not.toHaveBeenCalled();
  });

  it("mostra subito lo stato annullato senza aspettare la rilettura", async () => {
    // La rilettura non deve costare la performance percepita: lo status passa
    // ad annullato all'istante, i dati dell'annullo arrivano dopo.
    let resolveDetail: (value: { item: ReceiptListItem }) => void = () => {};
    vi.mocked(getReceiptDetail).mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );

    renderStorico();
    fireEvent.click(screen.getByText("5111-2188"));
    fireEvent.click(screen.getByText("Conferma annullo"));

    // `within` sulla riga: "Annullato" e' anche un'opzione del filtro Stato.
    const row = screen.getByText("5111-2188").closest("tr") as HTMLElement;
    await waitFor(() =>
      expect(within(row).getByText("Annullato")).toBeInTheDocument(),
    );

    resolveDetail({ item: VOIDED_ROW });
  });

  it("tiene la riga ottimistica se la rilettura fallisce", async () => {
    vi.mocked(getReceiptDetail).mockResolvedValue({
      item: null,
      error: "Non autenticato.",
    });

    renderStorico();

    voidFromDialog();

    await waitFor(() =>
      expect(screen.getByTestId("dialog-status")).toHaveTextContent(
        "VOID_ACCEPTED",
      ),
    );
    expect(screen.getByTestId("dialog-void-doc")).toHaveTextContent("nessuno");
  });

  it("non riapre la modale chiusa mentre la rilettura era in volo", async () => {
    let resolveDetail: (value: { item: ReceiptListItem }) => void = () => {};
    vi.mocked(getReceiptDetail).mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );

    renderStorico();
    voidFromDialog();
    fireEvent.click(screen.getByText("Chiudi modale"));

    // La rilettura atterra su una modale gia' chiusa: deve aggiornare
    // l'elenco senza resuscitare il dettaglio addosso all'esercente, che nel
    // frattempo e' tornato alla cassa.
    resolveDetail({ item: VOIDED_ROW });

    await waitFor(() => expect(getReceiptDetail).toHaveBeenCalled());
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("non rilegge nulla quando l'annullo e' fallito", () => {
    renderStorico();

    fireEvent.click(screen.getByText("5111-2188"));
    // La mutation ha risposto ma l'annullo non c'e' stato (rifiuto AdE, trial
    // scaduto, rate limit): la riga resta emessa e non c'e' nulla da rileggere.
    fireEvent.click(screen.getByText("Annullo fallito"));

    expect(getReceiptDetail).not.toHaveBeenCalled();
    expect(screen.getByTestId("dialog-status")).toHaveTextContent("ACCEPTED");
  });
});
