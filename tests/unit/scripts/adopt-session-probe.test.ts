// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  maskPartitaIva,
  parseArgs,
  runFromCli,
  runProbe,
  type ProbeClient,
} from "../../../scripts/adopt-session-probe";
import { AdeSessionExpiredError } from "../../../src/lib/ade/errors";
import type {
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdePayload,
} from "../../../src/lib/ade/types";

const COOKIES = "JSESSIONID=abc; LtpaToken2=xyz";
// 10:00 a Roma, stesso giorno in UTC
const NOW = new Date("2026-09-24T08:00:00Z");

function makeCedente(defAliquotaIVA = "22"): AdeCedentePrestatore {
  return {
    identificativiFiscali: {
      codicePaese: "IT",
      partitaIva: "12345678006",
      codiceFiscale: "RSSMRA80A01H501A",
    },
    altriDatiIdentificativi: {
      denominazione: "",
      nome: "Mario",
      cognome: "Rossi",
      indirizzo: "Via Roma",
      numeroCivico: "1",
      cap: "00100",
      comune: "Roma",
      provincia: "RM",
      nazione: "IT",
      modificati: false,
      defAliquotaIVA,
      nuovoUtente: false,
    },
    multiAttivita: [],
    multiSede: [],
  };
}

const saleDoc: AdeDocumentDetail = {
  idtrx: "151085589",
  documentoCommerciale: {
    cfCessionarioCommittente: "",
    flagDocCommPerRegalo: false,
    progressivoCollegato: "",
    dataOra: "24/09/2026",
    multiAttivita: { codiceAttivita: "", descAttivita: "" },
    importoTotaleIva: "0",
    scontoTotale: "0",
    scontoTotaleLordo: "0",
    totaleImponibile: "0.01",
    ammontareComplessivo: "0.01",
    totaleNonRiscosso: "0",
    scontoAbbuono: "0",
    importoDetraibileDeducibile: "0",
    elementiContabili: [
      {
        idElementoContabile: "270270040",
        reso: "0.00",
        quantita: "1.00",
        descrizioneProdotto: "Prova",
        prezzoLordo: "0.01",
        prezzoUnitario: "0.01",
        scontoUnitario: "0",
        scontoLordo: "0",
        aliquotaIVA: "N2",
        importoIVA: "0",
        imponibile: "0.01",
        imponibileNetto: "0.01",
        totale: "0.01",
        omaggio: "N",
      },
    ],
  },
};

function makeClient(overrides: Partial<ProbeClient> = {}): ProbeClient {
  return {
    adoptSession: vi.fn().mockResolvedValue({
      pAuth: "",
      partitaIva: "12345678006",
      createdAt: 0,
    }),
    getFiscalData: vi.fn().mockResolvedValue(makeCedente()),
    submitSale: vi.fn().mockResolvedValue({
      esito: true,
      idtrx: "151085589",
      progressivo: "DCW2026/5111-2188",
      errori: [],
    }),
    getDocument: vi.fn().mockResolvedValue(saleDoc),
    submitVoid: vi.fn().mockResolvedValue({
      esito: true,
      idtrx: "151085590",
      progressivo: "DCW2026/5111-2189",
      errori: [],
    }),
    ...overrides,
  };
}

function run(client: ProbeClient, opts: { emit?: boolean; vat?: string } = {}) {
  const lines: string[] = [];
  const result = runProbe({
    client,
    cookieHeader: COOKIES,
    emit: opts.emit ?? false,
    vatCode: opts.vat,
    now: NOW,
    log: (line) => lines.push(line),
  });
  return { result, lines };
}

describe("parseArgs", () => {
  it("senza flag: solo il gradino di lettura", () => {
    expect(parseArgs([])).toEqual({ emit: false, vatCode: undefined });
  });

  it("legge --emit e --vat", () => {
    expect(parseArgs(["--emit", "--vat", "N2"])).toEqual({
      emit: true,
      vatCode: "N2",
    });
  });

  it("--vat senza valore è un errore, non un'aliquota vuota", () => {
    expect(() => parseArgs(["--vat"])).toThrow(/--vat/);
    expect(() => parseArgs(["--vat", "--emit"])).toThrow(/--vat/);
  });

  it("rifiuta un flag sconosciuto invece di ignorarlo", () => {
    expect(() => parseArgs(["--emitt"])).toThrow(/--emitt/);
  });
});

describe("maskPartitaIva", () => {
  it("lascia visibili solo le ultime tre cifre", () => {
    expect(maskPartitaIva("12345678006")).toBe("********006");
  });

  it("non espone niente di una stringa troppo corta", () => {
    expect(maskPartitaIva("123")).toBe("***");
  });
});

describe("runProbe — gradino 1 (default)", () => {
  it("adotta la sessione, legge i dati fiscali e non emette niente", async () => {
    const client = makeClient();
    const { result, lines } = run(client);

    await expect(result).resolves.toEqual({ emitted: false });
    expect(client.adoptSession).toHaveBeenCalledWith(COOKIES);
    expect(client.getFiscalData).toHaveBeenCalledOnce();
    expect(client.submitSale).not.toHaveBeenCalled();
    expect(client.submitVoid).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("********006");
    expect(lines.join("\n")).toContain("--emit");
  });

  it("non stampa mai la P.IVA intera né il cookie", async () => {
    const { result, lines } = run(makeClient());
    await result;
    const out = lines.join("\n");
    expect(out).not.toContain("12345678006");
    expect(out).not.toContain("JSESSIONID");
  });

  it("una sessione rifiutata risale com'è: è l'esito che il probe misura", async () => {
    const client = makeClient({
      adoptSession: vi.fn().mockRejectedValue(new AdeSessionExpiredError()),
    });
    await expect(run(client).result).rejects.toThrow(AdeSessionExpiredError);
    expect(client.getFiscalData).not.toHaveBeenCalled();
  });
});

describe("runProbe — gradino 2 (--emit)", () => {
  it("emette €0,01 in contanti con la data fiscale di Roma e l'aliquota del portale", async () => {
    const client = makeClient();
    await run(client, { emit: true }).result;

    const payload = vi.mocked(client.submitSale).mock.calls[0][0] as AdePayload;
    const doc = payload.documentoCommerciale;
    expect(doc.dataOra).toBe("24/09/2026");
    expect(doc.ammontareComplessivo).toBe("0.01000000");
    expect(doc.vendita).toContainEqual(
      expect.objectContaining({ tipo: "PC", importo: "0.01" }),
    );
    expect(doc.elementiContabili).toHaveLength(1);
    expect(doc.elementiContabili[0].aliquotaIVA).toBe("22");
    expect(payload.cedentePrestatore.identificativiFiscali.partitaIva).toBe(
      "12345678006",
    );
  });

  it("--vat vince sull'aliquota di default del portale", async () => {
    const client = makeClient();
    await run(client, { emit: true, vat: "N2" }).result;

    const payload = vi.mocked(client.submitSale).mock.calls[0][0] as AdePayload;
    expect(payload.documentoCommerciale.elementiContabili[0].aliquotaIVA).toBe(
      "N2",
    );
  });

  it("senza --vat e senza aliquota di default si ferma prima di emettere", async () => {
    const client = makeClient({
      getFiscalData: vi.fn().mockResolvedValue(makeCedente("")),
    });
    await expect(run(client, { emit: true }).result).rejects.toThrow(/--vat/);
    expect(client.submitSale).not.toHaveBeenCalled();
  });

  it("annulla lo scontrino appena emesso, con il documento letto dall'AdE", async () => {
    const client = makeClient();
    const { result, lines } = run(client, { emit: true });

    await expect(result).resolves.toEqual({
      emitted: true,
      saleProgressive: "DCW2026/5111-2188",
      voidProgressive: "DCW2026/5111-2189",
    });
    expect(client.getDocument).toHaveBeenCalledWith("151085589");
    const voidPayload = vi.mocked(client.submitVoid).mock
      .calls[0][0] as AdePayload;
    expect(voidPayload.documentoCommerciale.resoAnnullo).toEqual({
      tipologia: "A",
      dataOra: "24/09/2026",
      progressivo: "DCW2026/5111-2188",
    });
    expect(lines.join("\n")).toContain("DCW2026/5111-2189");
  });

  it("una vendita rifiutata dall'AdE (esito false) non tenta l'annullo", async () => {
    const client = makeClient({
      submitSale: vi.fn().mockResolvedValue({
        esito: false,
        idtrx: null,
        progressivo: null,
        errori: [{ codice: "E01", descrizione: "aliquota non valida" }],
      }),
    });

    await expect(run(client, { emit: true }).result).rejects.toThrow(
      /aliquota non valida/,
    );
    expect(client.submitVoid).not.toHaveBeenCalled();
  });

  it("se l'annullo fallisce dice quale scontrino annullare a mano", async () => {
    const client = makeClient({
      submitVoid: vi.fn().mockRejectedValue(new AdeSessionExpiredError()),
    });

    await expect(run(client, { emit: true }).result).rejects.toThrow(
      /DCW2026\/5111-2188.*annull/i,
    );
  });

  it("anche un annullo con esito false chiede l'annullo a mano", async () => {
    const client = makeClient({
      submitVoid: vi.fn().mockResolvedValue({
        esito: false,
        idtrx: null,
        progressivo: null,
        errori: [{ codice: "E99", descrizione: "boh" }],
      }),
    });

    await expect(run(client, { emit: true }).result).rejects.toThrow(
      /DCW2026\/5111-2188/,
    );
  });
});

describe("runFromCli", () => {
  function cli(
    opts: {
      argv?: string[];
      stdinIsTTY?: boolean;
      stdin?: string;
      client?: ProbeClient;
    } = {},
  ) {
    const out: string[] = [];
    const err: string[] = [];
    const client = opts.client ?? makeClient();
    const createClient = vi.fn().mockResolvedValue(client);
    const code = runFromCli({
      argv: opts.argv ?? [],
      stdinIsTTY: opts.stdinIsTTY ?? false,
      readStdin: async () => opts.stdin ?? `${COOKIES}\n`,
      createClient,
      now: NOW,
      log: (line) => out.push(line),
      error: (line) => err.push(line),
    });
    return { code, out, err, client, createClient };
  }

  it("legge il cookie da stdin senza il newline dell'incolla e torna 0", async () => {
    const { code, client } = cli();
    await expect(code).resolves.toBe(0);
    expect(client.adoptSession).toHaveBeenCalledWith(COOKIES);
  });

  it("passa --emit al probe", async () => {
    const { code, client } = cli({ argv: ["--emit"] });
    await expect(code).resolves.toBe(0);
    expect(client.submitSale).toHaveBeenCalledOnce();
  });

  it("con stdin da terminale si ferma prima di creare il client", async () => {
    const { code, err, createClient } = cli({ stdinIsTTY: true });
    await expect(code).resolves.toBe(1);
    expect(err.join("\n")).toMatch(/stdin/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("un argomento sbagliato esce con 1 e lo nomina", async () => {
    const { code, err, createClient } = cli({ argv: ["--emitt"] });
    await expect(code).resolves.toBe(1);
    expect(err.join("\n")).toContain("--emitt");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("un errore del probe esce con 1 e stampa solo il messaggio", async () => {
    const client = makeClient({
      adoptSession: vi.fn().mockRejectedValue(new AdeSessionExpiredError()),
    });
    const { code, err } = cli({ client });
    await expect(code).resolves.toBe(1);
    expect(err).toEqual(["Session expired and re-auth failed"]);
  });

  it("anche un throw non-Error esce con 1", async () => {
    const client = makeClient({
      adoptSession: vi.fn().mockRejectedValue("boom"),
    });
    const { code, err } = cli({ client });
    await expect(code).resolves.toBe(1);
    expect(err).toEqual(["boom"]);
  });
});
