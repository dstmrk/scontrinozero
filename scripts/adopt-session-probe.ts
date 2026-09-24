/**
 * Probe del punto E di docs/mobile-v2.md: una sessione del portale AdE aperta
 * in un browser (login SPID) regge un'emissione se il server la adotta dai
 * soli cookie? È la domanda su cui poggia l'app nativa: la webview cattura i
 * cookie, il server emette.
 *
 * Due gradini, nello stesso script:
 *
 *   default  → adozione + lettura dei dati fiscali. Nessun effetto fiscale.
 *   --emit   → in più emette uno scontrino da €0,01 in contanti e lo annulla
 *              subito. È un documento commerciale VERO: resta sul cassetto
 *              fiscale come vendita più annullo.
 *
 * Il cookie arriva da stdin, mai da un argomento o da un file: non finisce
 * nella history della shell né nella lista dei processi. È l'header `Cookie`
 * di una richiesta a ivaservizi.agenziaentrate.gov.it/ser/api/…, copiato dai
 * DevTools con l'utenza di lavoro già scelta nel portale.
 *
 * Usage (macOS, cookie negli appunti):
 *   pbpaste | LOG_LEVEL=warn npx tsx scripts/adopt-session-probe.ts
 *   pbpaste | LOG_LEVEL=warn npx tsx scripts/adopt-session-probe.ts --emit
 *   pbpaste | LOG_LEVEL=warn npx tsx scripts/adopt-session-probe.ts --emit --vat N2
 *
 * `--vat` serve solo se il portale non ha un'aliquota di default. Finito il
 * probe, fai logout dal portale: invalida la sessione che hai copiato.
 */

import { randomUUID } from "node:crypto";
import type { RealAdeClient } from "../src/lib/ade/real-client";
import {
  mapSaleToAdePayload,
  mapVoidToAdePayload,
} from "../src/lib/ade/mapper";
import type { AdeError, AdeResponse } from "../src/lib/ade/types";
import { getFiscalDate } from "../src/lib/date-utils";

export type ProbeClient = Pick<
  RealAdeClient,
  "adoptSession" | "getFiscalData" | "submitSale" | "getDocument" | "submitVoid"
>;

export interface ProbeArgs {
  emit: boolean;
  vatCode: string | undefined;
}

export type ProbeResult =
  | { emitted: false }
  | { emitted: true; saleProgressive: string; voidProgressive: string };

export function parseArgs(argv: string[]): ProbeArgs {
  let emit = false;
  let vatCode: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--emit") {
      emit = true;
    } else if (arg === "--vat") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--vat richiede un codice aliquota (es. 22, N2)");
      }
      vatCode = value;
      i++;
    } else {
      throw new Error(`Argomento sconosciuto: ${arg}`);
    }
  }

  return { emit, vatCode };
}

/** Il probe stampa sul terminale: la P.IVA intera non serve a nessuno. */
export function maskPartitaIva(piva: string): string {
  if (piva.length <= 3) return "*".repeat(piva.length);
  return "*".repeat(piva.length - 3) + piva.slice(-3);
}

function describeErrors(errori: AdeError[]): string {
  return errori.map((e) => `${e.codice} ${e.descrizione}`).join("; ");
}

function assertAccepted(response: AdeResponse, what: string): string {
  if (!response.esito || !response.progressivo || !response.idtrx) {
    throw new Error(
      `${what} rifiutata dall'AdE: ${describeErrors(response.errori) || "nessun dettaglio"}`,
    );
  }
  return response.progressivo;
}

export async function runProbe(deps: {
  client: ProbeClient;
  cookieHeader: string;
  emit: boolean;
  vatCode: string | undefined;
  now: Date;
  log: (line: string) => void;
}): Promise<ProbeResult> {
  const { client, log } = deps;

  const session = await client.adoptSession(deps.cookieHeader);
  log(`Sessione adottata: P.IVA ${maskPartitaIva(session.partitaIva)}`);

  const cedente = await client.getFiscalData();
  log("Dati fiscali letti con la sessione adottata.");

  if (!deps.emit) {
    log(
      "Gradino 1 superato. Per emettere e annullare €0,01 rilancia con --emit.",
    );
    return { emitted: false };
  }

  const vatCode =
    deps.vatCode ?? cedente.altriDatiIdentificativi.defAliquotaIVA;
  if (!vatCode) {
    throw new Error(
      "Il portale non ha un'aliquota di default: passa --vat (es. 22, N2).",
    );
  }

  const fiscalDate = getFiscalDate(deps.now);
  const salePayload = mapSaleToAdePayload(
    {
      date: fiscalDate,
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Prova ScontrinoZero (annullata)",
          quantity: 1,
          unitPriceGross: 0.01,
          lineDiscount: 0,
          vatCode,
          isGift: false,
        },
      ],
      payments: [{ type: "CASH", amount: 0.01 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    },
    cedente,
  );

  const sale = await client.submitSale(salePayload);
  const saleProgressive = assertAccepted(sale, "Vendita");
  log(`Vendita accettata: documento ${saleProgressive}.`);

  // Da qui in poi esiste un documento fiscale vero: ogni fallimento deve dire
  // quale annullare a mano, altrimenti resta un €0,01 orfano sul cassetto.
  try {
    const original = await client.getDocument(sale.idtrx as string);
    const voidPayload = mapVoidToAdePayload(
      {
        idempotencyKey: randomUUID(),
        originalDocument: {
          transactionId: sale.idtrx as string,
          documentProgressive: saleProgressive,
          date: fiscalDate,
        },
      },
      cedente,
      original,
    );
    const voided = await client.submitVoid(voidPayload);
    const voidProgressive = assertAccepted(voided, "Annullo");
    log(`Annullo accettato: documento ${voidProgressive}. Gradino 2 superato.`);
    return { emitted: true, saleProgressive, voidProgressive };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Vendita ${saleProgressive} emessa ma NON annullata (${reason}). ` +
        "Annullala a mano dal portale Documento Commerciale Online.",
      { cause: err },
    );
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runFromCli(deps: {
  argv: string[];
  stdinIsTTY: boolean;
  readStdin: () => Promise<string>;
  createClient: () => Promise<ProbeClient>;
  now: Date;
  log: (line: string) => void;
  error: (line: string) => void;
}): Promise<number> {
  try {
    const args = parseArgs(deps.argv);
    if (deps.stdinIsTTY) {
      throw new Error(
        "Passa l'header Cookie da stdin, es. `pbpaste | npx tsx scripts/adopt-session-probe.ts`.",
      );
    }
    const cookieHeader = (await deps.readStdin()).trim();

    await runProbe({
      client: await deps.createClient(),
      cookieHeader,
      emit: args.emit,
      vatCode: args.vatCode,
      now: deps.now,
      log: deps.log,
    });
    return 0;
  } catch (err) {
    deps.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

if (process.argv[1]?.endsWith("adopt-session-probe.ts")) {
  runFromCli({
    argv: process.argv.slice(2),
    stdinIsTTY: Boolean(process.stdin.isTTY),
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    },
    // Import dinamico: il client porta con sé logger e Sentry, che il
    // parsing degli argomenti e il controllo di stdin non devono aspettare.
    createClient: async () => {
      const { RealAdeClient } = await import("../src/lib/ade/real-client");
      return new RealAdeClient();
    },
    now: new Date(),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then((code) => process.exit(code));
}
