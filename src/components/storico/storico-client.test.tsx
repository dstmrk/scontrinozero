import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { StoricoClient } from "./storico-client";
import {
  getReceiptDetail,
  searchReceipts,
  searchReceiptsIncludingAde,
} from "@/server/storico-actions";
import type { AdeReceiptListItem, ReceiptListItem } from "@/types/storico";

vi.mock("@/server/storico-actions", () => ({
  searchReceipts: vi.fn(),
  searchReceiptsIncludingAde: vi.fn(),
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
  origin: "local",
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

const ADE_ROW: AdeReceiptListItem = {
  origin: "ade",
  idtrx: "226076907",
  adeProgressive: "DCW2026/2610-5298",
  adeRegisteredAt: new Date("2026-02-14T09:00:00Z"),
  status: "ACCEPTED",
  total: "7.50",
};

const TOGGLE_LABEL = /Cerca anche i documenti emessi fuori da ScontrinoZero/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchReceipts).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
    items: [],
    total: 0,
  });
  vi.mocked(getReceiptDetail).mockResolvedValue({ item: VOIDED_ROW });
});

describe("StoricoClient — ricerca sull'archivio AdE", () => {
  it("il flag non esiste per chi non ha il piano Pro", () => {
    render(
      <StoricoClient
        businessId={BUSINESS_ID}
        initialItems={[ACCEPTED_ROW]}
        initialTotal={1}
        plan="starter"
      />,
    );

    expect(screen.queryByLabelText(TOGGLE_LABEL)).not.toBeInTheDocument();
  });

  it("spuntare il flag non fa partire nessuna ricerca da solo", () => {
    // Ogni ricerca con il flag attivo costa un login AdE a nome
    // dell'esercente: deve partire quando lo decide lui, premendo "Cerca".
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));

    expect(searchReceiptsIncludingAde).not.toHaveBeenCalled();
  });

  it("con il flag attivo la ricerca passa dall'archivio AdE", async () => {
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    await waitFor(() => expect(searchReceiptsIncludingAde).toHaveBeenCalled());
    expect(searchReceipts).not.toHaveBeenCalled();
  });

  it("senza flag la ricerca resta quella locale", async () => {
    renderStorico();

    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    await waitFor(() => expect(searchReceipts).toHaveBeenCalled());
    expect(searchReceiptsIncludingAde).not.toHaveBeenCalled();
  });

  it("una riga che vive solo su AdE si riconosce nell'elenco", async () => {
    vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
      items: [ADE_ROW],
      total: 1,
    });
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    const cell = await screen.findByText("2610-5298");
    expect(
      within(cell.closest("td") as HTMLElement).getByText("AdE"),
    ).toBeInTheDocument();
  });

  it("una riga AdE non si apre: non c'è nessun dettaglio da mostrare", async () => {
    vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
      items: [ADE_ROW],
      total: 1,
    });
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    fireEvent.click(await screen.findByText("2610-5298"));

    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("AdE irraggiungibile: l'avviso compare e le righe nostre restano", async () => {
    vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
      items: [ACCEPTED_ROW],
      total: 1,
      adeError: "Agenzia delle Entrate non raggiungibile.",
    });
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    expect(await screen.findByText(/non raggiungibile/)).toBeInTheDocument();
    expect(screen.getByText("5111-2188")).toBeInTheDocument();
  });

  it("sessione CIE scaduta: l'avviso porta alle impostazioni", async () => {
    vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
      items: [],
      total: 0,
      adeError: "Sessione CIE scaduta.",
      adeReauthRequired: true,
    });
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    expect(
      await screen.findByRole("link", { name: /ricollegarti/ }),
    ).toBeInTheDocument();
  });

  it("archivio troncato: l'elenco lo dichiara invece di sembrare completo", async () => {
    vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
      items: [ADE_ROW],
      total: 1,
      adeTruncated: true,
    });
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    expect(
      await screen.findByText(/restringi il periodo/i),
    ).toBeInTheDocument();
  });

  it("il rifiuto della richiesta intera arriva come avviso, non in silenzio", async () => {
    vi.mocked(searchReceiptsIncludingAde).mockResolvedValue({
      items: [],
      total: 0,
      error:
        "La ricerca sull'Agenzia delle Entrate copre al massimo 31 giorni per volta. Restringi il periodo.",
    });
    renderStorico();

    fireEvent.click(screen.getByLabelText(TOGGLE_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));

    expect(await screen.findByText(/al massimo 31 giorni/)).toBeInTheDocument();
  });
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
