import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ERROR_MESSAGES } from "@/lib/error-messages";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockFetchPublicReceipt = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/receipts/fetch-public-receipt", () => ({
  fetchPublicReceipt: (...args: unknown[]) => mockFetchPublicReceipt(...args),
}));

vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

// Note: get-client-ip and rate-limit use real implementations.

// ─── Fixtures ───────────────────────────────────────────────────────────────

const VALID_DOC_ID = "123e4567-e89b-12d3-a456-426614174000";

const MOCK_RECEIPT_DATA = {
  doc: {
    id: "doc-1",
    publicRequest: { paymentMethod: "PC" },
    adeProgressive: "ABC-123",
    createdAt: new Date("2026-01-01T09:59:57Z"),
    adeRegisteredAt: new Date("2026-01-01T10:00:00Z"),
  },
  biz: {
    businessName: "Bar Mario",
    address: "Via Roma 1",
    city: "Milano",
    province: "MI",
    zipCode: "20100",
    vatNumber: "12345678901",
  },
  lines: [],
  voidedSale: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe("PublicReceiptPage rate limiting", () => {
  // Fresh import per test: the rate limiter is a module-level singleton, so
  // vi.resetModules() resets the 60-request budget between cases.
  let PublicReceiptPage: typeof import("./page").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "1.2.3.4" }),
    );
    vi.resetModules();
    ({ default: PublicReceiptPage } = await import("./page"));
  });

  function renderPage(documentId = VALID_DOC_ID) {
    return PublicReceiptPage({ params: Promise.resolve({ documentId }) });
  }

  it("renders the receipt when under the rate limit", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);

    render(await renderPage());

    expect(screen.getByText("Bar Mario")).toBeInTheDocument();
    expect(mockFetchPublicReceipt).toHaveBeenCalledWith(VALID_DOC_ID);
  });

  // v1.7.0: un annullo non deve essere reso con il layout di vendita, che lo
  // presenterebbe come uno scontrino valido. Finche' manca il layout dedicato
  // (HAR.md #16a) la pagina pubblica non lo serve affatto.
  it("chiama notFound() per un annullo finche' manca il layout dedicato", async () => {
    mockFetchPublicReceipt.mockResolvedValue({
      ...MOCK_RECEIPT_DATA,
      voidedSale: { id: "doc-1", adeProgressive: "ABC-123" },
    });

    // Il mock di notFound() lancia, come il vero: la pagina non completa
    // il render.
    await expect(renderPage()).rejects.toThrow();
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("renders the rate-limit message after exceeding 60 requests per IP", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "9.9.9.9" }),
    );

    // Exhaust the 60-request budget for this IP (advance the limiter without
    // mounting — testing-library does not auto-clean DOM between renders within
    // a single test).
    for (let i = 0; i < 60; i++) {
      await renderPage();
    }

    render(await renderPage());

    expect(
      screen.getByText(ERROR_MESSAGES.RATE_LIMIT_PUBLIC_MINUTES),
    ).toBeInTheDocument();
  });

  it("does not query the DB once the limit is exceeded", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "8.8.8.8" }),
    );

    for (let i = 0; i < 60; i++) {
      await renderPage();
    }
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "8.8.8.8" }),
    );

    await renderPage();

    expect(mockFetchPublicReceipt).not.toHaveBeenCalled();
  });

  it("keys the limit per IP — a different IP gets its own budget", async () => {
    mockFetchPublicReceipt.mockResolvedValue(MOCK_RECEIPT_DATA);

    // Exhaust IP 1.1.1.1.
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "1.1.1.1" }),
    );
    for (let i = 0; i < 61; i++) {
      await renderPage();
    }

    // A distinct IP is unaffected.
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "2.2.2.2" }),
    );
    render(await renderPage());

    expect(screen.getByText("Bar Mario")).toBeInTheDocument();
    expect(mockFetchPublicReceipt).toHaveBeenCalledWith(VALID_DOC_ID);
  });
});

describe("PublicReceiptPage — descrizioni lunghe", () => {
  let PublicReceiptPage: typeof import("./page").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "9.9.9.9" }),
    );
    vi.resetModules();
    ({ default: PublicReceiptPage } = await import("./page"));
  });

  it("spezza le descrizioni senza spazi invece di sforare dalla card", async () => {
    // Un codice prenotazione senza spazi non ha punti di a-capo: senza
    // `break-words` il testo esce dalla card larga `max-w-md` e fa scrollare
    // in orizzontale l'intera pagina pubblica (verificato in Chromium
    // headless — jsdom non fa layout).
    const description = "Pernottamento_Room2_MarioRossi_Booking45873_LONG_0001";
    mockFetchPublicReceipt.mockResolvedValue({
      ...MOCK_RECEIPT_DATA,
      lines: [
        {
          id: "line-1",
          description,
          quantity: "1",
          grossUnitPrice: "120.00",
          vatCode: "10",
        },
      ],
    });

    render(
      await PublicReceiptPage({
        params: Promise.resolve({ documentId: VALID_DOC_ID }),
      }),
    );

    expect(screen.getByText(description)).toHaveClass("break-words");
  });
});

// ---------------------------------------------------------------------------
// Layout AdE — la copia web espone le stesse voci del PDF e della termica.
// La card resta una card (non una striscia monospaziata), ma etichette,
// ordine delle sezioni e voci obbligatorie sono quelli del layout standard.
// ---------------------------------------------------------------------------

describe("PublicReceiptPage — layout AdE", () => {
  let PublicReceiptPage: typeof import("./page").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "7.7.7.7" }),
    );
    vi.resetModules();
    ({ default: PublicReceiptPage } = await import("./page"));
  });

  const LINES = [
    {
      id: "line-1",
      description: "Pizza Margherita",
      quantity: "2",
      grossUnitPrice: "8.50",
      vatCode: "10",
    },
    {
      id: "line-2",
      description: "Acqua minerale",
      quantity: "1",
      grossUnitPrice: "2.00",
      vatCode: "22",
    },
  ];

  async function renderReceipt(
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    mockFetchPublicReceipt.mockResolvedValue({
      ...MOCK_RECEIPT_DATA,
      lines: LINES,
      ...overrides,
    });
    render(
      await PublicReceiptPage({
        params: Promise.resolve({ documentId: VALID_DOC_ID }),
      }),
    );
  }

  it("stampa P.IVA sopra l'indirizzo, con la località nella forma Comune(PR), CAP", async () => {
    await renderReceipt();
    expect(screen.getByText("P.IVA 12345678901")).toBeInTheDocument();
    expect(screen.getByText("Via Roma 1")).toBeInTheDocument();
    expect(screen.getByText("Milano(MI), 20100")).toBeInTheDocument();
  });

  it("usa le intestazioni di colonna del layout standard", async () => {
    await renderReceipt();
    expect(screen.getByText("DESCRIZIONE")).toBeInTheDocument();
    expect(screen.getByText("Prezzo(€)")).toBeInTheDocument();
  });

  it("scrive la riga quantità nella forma AdE `n.Q * prezzo`", async () => {
    await renderReceipt();
    expect(screen.getByText("n.2 * 8,50")).toBeInTheDocument();
  });

  it("chiama il totale `TOTALE COMPLESSIVO`, come PDF e termica", async () => {
    await renderReceipt();
    expect(screen.getByText("TOTALE COMPLESSIVO")).toBeInTheDocument();
    expect(screen.queryByText("Totale")).not.toBeInTheDocument();
  });

  it("espone l'IVA aggregata più il dettaglio per aliquota", async () => {
    await renderReceipt();
    expect(screen.getByText("di cui IVA")).toBeInTheDocument();
    expect(screen.getByText("di cui IVA 10%")).toBeInTheDocument();
    expect(screen.getByText("di cui IVA 22%")).toBeInTheDocument();
  });

  it("con una sola aliquota non ripete il dettaglio sotto l'aggregato", async () => {
    await renderReceipt({ lines: [LINES[1]] });
    expect(screen.getByText("di cui IVA")).toBeInTheDocument();
    expect(screen.queryByText("di cui IVA 22%")).not.toBeInTheDocument();
  });

  it("mostra la modalità di pagamento con il suo importo e sempre `Importo pagato`", async () => {
    await renderReceipt();
    expect(screen.getByText("Pagamento contante")).toBeInTheDocument();
    expect(screen.getByText("Importo pagato")).toBeInTheDocument();
    // 2×8,50 + 2,00 = 19,00, ripetuto su totale, pagamento e importo pagato.
    expect(screen.getAllByText("19,00").length).toBeGreaterThanOrEqual(3);
  });

  it("a totale zero omette la modalità ma tiene `Importo pagato`", async () => {
    await renderReceipt({
      lines: [
        {
          id: "line-1",
          description: "Omaggio",
          quantity: "1",
          grossUnitPrice: "0.00",
          vatCode: "22",
        },
      ],
    });
    expect(screen.queryByText("Pagamento contante")).not.toBeInTheDocument();
    expect(screen.getByText("Importo pagato")).toBeInTheDocument();
  });

  it("omette `di cui IVA` quando tutte le righe sono a natura", async () => {
    await renderReceipt({
      lines: [
        {
          id: "line-1",
          description: "Prestazione esente",
          quantity: "1",
          grossUnitPrice: "50.00",
          vatCode: "N4",
        },
      ],
    });
    expect(screen.queryByText("di cui IVA")).not.toBeInTheDocument();
    expect(screen.getByText("TOTALE COMPLESSIVO")).toBeInTheDocument();
  });

  it("rende l'intestazione anche senza alcun dato indirizzo", async () => {
    await renderReceipt({
      biz: {
        ...MOCK_RECEIPT_DATA.biz,
        address: null,
        city: null,
        province: null,
        zipCode: null,
      },
    });
    expect(screen.getByText("Bar Mario")).toBeInTheDocument();
    expect(screen.getByText("P.IVA 12345678901")).toBeInTheDocument();
  });

  it("chiama il progressivo `DOCUMENTO N.`, non `Identificativo AdE`", async () => {
    await renderReceipt();
    expect(screen.getByText("DOCUMENTO N.")).toBeInTheDocument();
    expect(screen.queryByText("Identificativo AdE")).not.toBeInTheDocument();
  });

  it("mostra ade_registered_at, non il createdAt della riga", async () => {
    await renderReceipt();
    // 10:00 UTC = 11:00 a Roma (CET). Il createdAt della riga e' 09:59:57Z:
    // se la pagina lo stampasse si vedrebbe 10:59, tre secondi prima del PDF.
    expect(screen.getByText("01-01-2026 11:00")).toBeInTheDocument();
    expect(screen.queryByText("01-01-2026 10:59")).not.toBeInTheDocument();
  });

  it("mostra il codice lotteria sotto la caption `Codice Lotteria`", async () => {
    await renderReceipt({
      doc: {
        ...MOCK_RECEIPT_DATA.doc,
        publicRequest: { paymentMethod: "PE", lotteryCode: "YYWLR30G" },
      },
    });
    expect(screen.getByText("Codice Lotteria")).toBeInTheDocument();
    expect(screen.getByText("YYWLR30G")).toBeInTheDocument();
  });
});

describe("PublicReceiptPage — codifica IVA AdE", () => {
  let PublicReceiptPage: typeof import("./page").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "cf-connecting-ip": "6.6.6.6" }),
    );
    vi.resetModules();
    ({ default: PublicReceiptPage } = await import("./page"));
  });

  async function renderWithLines(
    lines: ReadonlyArray<Record<string, unknown>>,
  ): Promise<void> {
    mockFetchPublicReceipt.mockResolvedValue({ ...MOCK_RECEIPT_DATA, lines });
    render(
      await PublicReceiptPage({
        params: Promise.resolve({ documentId: VALID_DOC_ID }),
      }),
    );
  }

  const EXEMPT_LINES = [
    {
      id: "line-1",
      description: "Prestazione esente",
      quantity: "1",
      grossUnitPrice: "100.00",
      vatCode: "N4",
    },
    {
      id: "line-2",
      description: "Marca da bollo",
      quantity: "1",
      grossUnitPrice: "2.00",
      vatCode: "N1",
    },
  ];

  it("mostra il mnemonico AdE in colonna invece dell'etichetta descrittiva", async () => {
    await renderWithLines(EXEMPT_LINES);
    expect(screen.getByText("ES*")).toBeInTheDocument();
    expect(screen.getByText("EE*")).toBeInTheDocument();
    expect(screen.queryByText("0% – Esente")).not.toBeInTheDocument();
  });

  it("scioglie gli asterischi in legenda, nell'ordine della tabella AdE", async () => {
    await renderWithLines(EXEMPT_LINES);
    const legend = screen
      .getAllByText(/^\*[A-Z]{2} = /)
      .map((n) => n.textContent);
    expect(legend).toEqual(["*EE = Esclusa", "*ES = Esente"]);
  });

  it("non mostra legenda quando il documento non ha nature", async () => {
    await renderWithLines([
      {
        id: "line-1",
        description: "Caffè",
        quantity: "1",
        grossUnitPrice: "1.20",
        vatCode: "22",
      },
    ]);
    expect(screen.queryByText(/^\*[A-Z]{2} = /)).not.toBeInTheDocument();
  });
});
