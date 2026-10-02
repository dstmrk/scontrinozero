/**
 * Documento commerciale di reso merce (HAR.md voce #19).
 *
 * Il reso è l'annullo della voce #9 con `resoAnnullo.tipologia: "R"` e una
 * quantità per riga: il portale rimanda la vendita letta dal dettaglio GET,
 * con gli `idElementoContabile` reali, e ricalcola gli importi di ogni riga
 * sui pezzi resi adesso. La quantità già resa sta nel campo di riga `reso`
 * del dettaglio, che è un cumulativo e diventa il `resiPregressi` del POST.
 *
 * Le quantità viaggiano in centesimi interi (`data-smart-float="-11.2"`, due
 * decimali, come `quantita`): confrontare i float diretti farebbe sembrare
 * "oltre il residuo" un 0,1 + 0,2.
 */
import {
  getVatPercentage,
  toAdeAmount,
  toAdeAmount8,
  toCorrectionCedente,
} from "./mapper";
import type {
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdeDocumentDetailElemento,
  AdeDocumentoCommerciale,
  AdeElementoContabile,
  AdePayload,
} from "./types";

/** Quantità (stringa AdE o numero) in centesimi interi. */
function toHundredths(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/** Pezzi già resi per riga, letti dal cumulativo `reso` del dettaglio GET. */
export function getReturnedQuantities(doc: AdeDocumentDetail): number[] {
  return doc.documentoCommerciale.elementiContabili.map(
    (el) => toHundredths(el.reso) / 100,
  );
}

/** Pezzi ancora rendibili per riga: venduti meno già resi, mai sotto zero. */
export function getReturnableQuantities(doc: AdeDocumentDetail): number[] {
  return doc.documentoCommerciale.elementiContabili.map(
    (el) =>
      Math.max(0, toHundredths(el.quantita) - toHundredths(el.reso)) / 100,
  );
}

/**
 * La vendita ha almeno un reso registrato sull'AdE, nostro o fatto dal
 * portale? È la guardia che l'AdE non mette: il portale accetta l'annullo di
 * una vendita già resa e storna il corrispettivo due volte (HAR.md #19f).
 */
export function hasAnyReturn(doc: AdeDocumentDetail): boolean {
  return doc.documentoCommerciale.elementiContabili.some(
    (el) => toHundredths(el.reso) > 0,
  );
}

export type ReturnQuantitiesError =
  | "LINE_COUNT_MISMATCH"
  | "INVALID_QUANTITY"
  | "NOTHING_TO_RETURN"
  | "EXCEEDS_RETURNABLE";

/**
 * Le quantità richieste sono un reso trasmissibile? `quantities` è allineato
 * per indice a `elementiContabili`; 0 vuol dire "riga non resa".
 *
 * Ritorna il motivo del rifiuto invece di lanciare: il service lo traduce in
 * un messaggio, il mapper lo usa come asserzione.
 */
export function validateReturnQuantities(
  doc: AdeDocumentDetail,
  quantities: readonly number[],
): ReturnQuantitiesError | null {
  const lines = doc.documentoCommerciale.elementiContabili;
  if (quantities.length !== lines.length) return "LINE_COUNT_MISMATCH";

  const invalid = quantities.some(
    (q) =>
      !Number.isFinite(q) ||
      q < 0 ||
      // Più di due decimali: il portale non li accetta e arrotondarli in
      // silenzio cambierebbe la quantità resa.
      Math.abs(q * 100 - toHundredths(q)) > 1e-6,
  );
  if (invalid) return "INVALID_QUANTITY";

  if (quantities.every((q) => toHundredths(q) === 0)) {
    return "NOTHING_TO_RETURN";
  }

  const returnable = getReturnableQuantities(doc);
  const exceeds = quantities.some(
    (q, i) => toHundredths(q) > toHundredths(returnable[i]!),
  );
  return exceeds ? "EXCEEDS_RETURNABLE" : null;
}

/**
 * Riga del reso con le formule misurate (HAR.md #19b). Con `r = reso/quantita`:
 * `imponibile = prezzoUnitario × reso`, `scontoUnitario = scontoUnitario × r`,
 * e il resto segue come in vendita. `prezzoLordo`, `prezzoUnitario` e
 * `scontoLordo` restano quelli della vendita.
 *
 * Ogni passaggio è arrotondato a 8 decimali prima del successivo, come gli
 * importi che il portale mostra e rimanda: sui quattro oracoli coincide al
 * centesimo di milionesimo, terzi compresi (voce #19c).
 */
function computeReturnLine(
  el: AdeDocumentDetailElemento,
  quantity: number,
): AdeElementoContabile {
  const sold = toHundredths(el.quantita);
  const returned = toHundredths(quantity);
  const round8 = (v: number) => Number(toAdeAmount8(v));

  const imponibile = round8(Number(el.prezzoUnitario) * (returned / 100));
  // Riga non resa: zero senza dividere, anche su una riga venduta a quantità
  // zero (il DB la ammette), dove `returned / sold` sarebbe 0/0.
  const scontoUnitario =
    returned === 0 ? 0 : round8((Number(el.scontoUnitario) * returned) / sold);
  const imponibileNetto = round8(imponibile - scontoUnitario);
  const importoIVA = round8(
    (imponibileNetto * getVatPercentage(el.aliquotaIVA)) / 100,
  );
  const totale = imponibileNetto + importoIVA;

  return {
    idElementoContabile: el.idElementoContabile,
    resiPregressi: toAdeAmount(Number(el.reso)), // 2d — il cumulativo del GET
    reso: toAdeAmount(quantity), // 2d
    quantita: toAdeAmount(Number(el.quantita)), // 2d — la quantità venduta
    descrizioneProdotto: el.descrizioneProdotto,
    prezzoLordo: toAdeAmount8(Number(el.prezzoLordo)),
    prezzoUnitario: toAdeAmount8(Number(el.prezzoUnitario)),
    scontoUnitario: toAdeAmount8(scontoUnitario),
    scontoLordo: toAdeAmount8(Number(el.scontoLordo)),
    aliquotaIVA: el.aliquotaIVA,
    importoIVA: toAdeAmount8(importoIVA),
    imponibile: toAdeAmount8(imponibile),
    imponibileNetto: toAdeAmount8(imponibileNetto),
    totale: toAdeAmount8(totale),
    omaggio: el.omaggio,
  };
}

export interface ReturnPayloadInput {
  readonly cedentePrestatore: AdeCedentePrestatore;
  /** Dettaglio GET della vendita, letto nella stessa sessione del POST. */
  readonly originalDoc: AdeDocumentDetail;
  /** Progressivo della vendita, quello che abbiamo registrato all'emissione. */
  readonly originalProgressive: string;
  /** Pezzi resi adesso, allineati per indice a `elementiContabili`. */
  readonly quantities: readonly number[];
}

/**
 * Costruisce il payload del reso. Lancia su quantità non valide: un reso è
 * irreversibile e il service le ha già validate, quindi arrivare qui con
 * quantità sbagliate è un bug, non un input da degradare.
 */
export function mapReturnToAdePayload(input: ReturnPayloadInput): AdePayload {
  const { originalDoc, quantities } = input;
  const validation = validateReturnQuantities(originalDoc, quantities);
  if (validation) {
    throw new Error(`Quantità di reso non valide: ${validation}`);
  }

  const docComm = originalDoc.documentoCommerciale;
  const elementiContabili = docComm.elementiContabili.map((el, i) =>
    computeReturnLine(el, quantities[i]!),
  );

  // Totali come in vendita (voce #4), ma tutti a piena precisione: il reso di
  // una riga scontata non cade sul centesimo (0,045 nella voce #19b) e il
  // portale trasmette proprio quel valore. Le righe omaggio restano fuori da
  // ammontareComplessivo (voce #7).
  const sum = (
    pick: (el: AdeElementoContabile) => string,
    rows: readonly AdeElementoContabile[] = elementiContabili,
  ): number => rows.reduce((acc, el) => acc + Number(pick(el)), 0);

  const documentoCommerciale: AdeDocumentoCommerciale = {
    cfCessionarioCommittente: docComm.cfCessionarioCommittente ?? "",
    flagDocCommPerRegalo: docComm.flagDocCommPerRegalo,
    progressivoCollegato: docComm.progressivoCollegato ?? "",
    dataOra: docComm.dataOra,
    multiAttivita: docComm.multiAttivita ?? {
      codiceAttivita: "",
      descAttivita: "",
    },
    importoTotaleIva: toAdeAmount8(sum((el) => el.importoIVA)),
    scontoTotale: toAdeAmount8(sum((el) => el.scontoUnitario)),
    scontoTotaleLordo: toAdeAmount8(sum((el) => el.scontoLordo)),
    totaleImponibile: toAdeAmount8(sum((el) => el.imponibile)),
    ammontareComplessivo: toAdeAmount8(
      sum(
        (el) => el.totale,
        elementiContabili.filter((el) => el.omaggio !== "Y"),
      ),
    ),
    // Rimandato dalla vendita, come fa il portale (HAR.md #19i: con un valore
    // diverso da zero non è misurato).
    totaleNonRiscosso: toAdeAmount8(Number(docComm.totaleNonRiscosso)),
    elementiContabili,
    // Rimandato ma non sottratto: lo sconto a pagare non riduce il
    // corrispettivo, quindi il reso storna il valore pieno (voce #19d).
    scontoAbbuono: toAdeAmount(Number(docComm.scontoAbbuono)),
    resoAnnullo: {
      tipologia: "R",
      dataOra: docComm.dataOra,
      progressivo: input.originalProgressive,
    },
    numeroProgressivo: input.originalProgressive,
    importoDetraibileDeducibile: toAdeAmount8(
      Number(docComm.importoDetraibileDeducibile),
    ),
  };

  return {
    idtrx: originalDoc.idtrx,
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: toCorrectionCedente(input.cedentePrestatore),
    documentoCommerciale,
    // Come l'annullo, che l'AdE accetta così in produzione: il portale lo
    // manda `false` (HAR.md #19i).
    flagIdentificativiModificati: true,
  };
}
