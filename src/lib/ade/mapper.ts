/**
 * Mapper: API pubblica → payload AdE.
 *
 * Reference: docs/api-spec.md sez. 9
 */

import type {
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdeDocumentoCommerciale,
  AdeElementoContabile,
  AdePayload,
  AdePaymentEntry,
  AdePaymentType,
} from "./types";
import type {
  PaymentType,
  SaleDocumentRequest,
  SaleLineRequest,
  VoidRequest,
} from "./public-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converte un numero in stringa con 2 decimali (formato AdE). */
export function toAdeAmount(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Converte un numero in stringa con 8 decimali (formato AdE).
 *
 * HAR finding (vendita.har): i campi monetari degli elementiContabili e i
 * totali del documentoCommerciale usano 8 cifre decimali. Fanno eccezione
 * (rimangono a 2d): quantita, resiPregressi, reso, scontoAbbuono, vendita[].importo.
 */
export function toAdeAmount8(value: number): string {
  return (
    Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000
  ).toFixed(8);
}

/** Converte una data ISO (yyyy-MM-dd) nel formato AdE (dd/MM/yyyy). */
export function toAdeDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// ---------------------------------------------------------------------------
// Payment type mapping (sez. 9.5)
// ---------------------------------------------------------------------------

export const PAYMENT_TYPE_MAP: Record<PaymentType, AdePaymentType> = {
  CASH: "PC",
  ELECTRONIC: "PE",
  MEAL_VOUCHER: "TR",
  NOT_COLLECTED_INVOICE: "NR_EF",
  NOT_COLLECTED_SERVICE: "NR_PS",
  NOT_COLLECTED_CREDIT: "NR_CS",
};

/** All AdE payment slots in the order they appear in the payload. */
const ALL_PAYMENT_SLOTS: AdePaymentType[] = [
  "PC",
  "PE",
  "TR",
  "NR_EF",
  "NR_PS",
  "NR_CS",
];

// ---------------------------------------------------------------------------
// Nature codes (no IVA)
// ---------------------------------------------------------------------------

const NATURE_CODES = new Set(["N1", "N2", "N3", "N4", "N5", "N6"]);

function isNature(vatCode: string): boolean {
  return NATURE_CODES.has(vatCode);
}

function getVatPercentage(vatCode: string): number {
  if (isNature(vatCode)) return 0;
  return Number.parseFloat(vatCode);
}

// ---------------------------------------------------------------------------
// Line computation (sez. 3.2)
// ---------------------------------------------------------------------------

/**
 * Computes all AdE amounts for a sale line.
 *
 * For lines with IVA rate: unitPriceGross is IVA-inclusive (lordo).
 *   prezzoLordo = unitPriceGross * quantity
 *   imponibile = prezzoLordo / (1 + rate/100)   (scorporo IVA)
 *   scontoLordo = unitDiscount * quantity
 *   imponibileNetto = imponibile - scontoLordo / (1 + rate/100)
 *   importoIVA = totale - imponibileNetto
 *   totale = prezzoLordo - scontoLordo
 *
 * For lines with natura (N1-N6): unitPriceGross = prezzoUnitario (no IVA).
 */
export function computeLineAmounts(
  line: SaleLineRequest,
): AdeElementoContabile {
  const vatPct = getVatPercentage(line.vatCode);
  const grossTotal = line.unitPriceGross * line.quantity;
  const discountTotal = line.unitDiscount * line.quantity;
  const netGross = grossTotal - discountTotal;

  let imponibile: number;
  let imponibileNetto: number;
  let importoIVA: number;
  let prezzoUnitario: number;

  if (vatPct === 0) {
    // Nature codes: no IVA, prezzoUnitario = prezzoLordo
    imponibile = grossTotal;
    imponibileNetto = netGross;
    importoIVA = 0;
    prezzoUnitario = grossTotal;
  } else {
    // Scorporo IVA dal lordo
    const divisor = 1 + vatPct / 100;
    imponibile = Math.round((grossTotal / divisor) * 100) / 100;
    imponibileNetto = Math.round((netGross / divisor) * 100) / 100;
    importoIVA = Math.round((netGross - imponibileNetto) * 100) / 100;
    prezzoUnitario = Math.round((grossTotal / divisor) * 100) / 100;
  }

  return {
    idElementoContabile: "",
    resiPregressi: toAdeAmount(0), // 2d (HAR: "0.00")
    reso: toAdeAmount(0), // 2d (HAR: "0.00")
    quantita: toAdeAmount(line.quantity), // 2d (HAR: "1.00")
    descrizioneProdotto: line.description,
    prezzoLordo: toAdeAmount8(grossTotal), // 8d (HAR: "3.20000000")
    prezzoUnitario: toAdeAmount8(prezzoUnitario), // 8d (HAR: "3.20000000")
    scontoUnitario: toAdeAmount8(line.unitDiscount), // 8d (HAR: "1.50000000")
    scontoLordo: toAdeAmount8(discountTotal), // 8d (HAR: "1.50000000")
    aliquotaIVA: line.vatCode,
    importoIVA: toAdeAmount8(importoIVA), // 8d (HAR: "0.00000000")
    imponibile: toAdeAmount8(imponibile), // 8d (HAR: "3.20000000")
    imponibileNetto: toAdeAmount8(imponibileNetto), // 8d (HAR: "1.70000000")
    totale: toAdeAmount8(netGross), // 8d (HAR: "1.70000000")
    omaggio: line.isGift ? "Y" : "N",
  };
}

// ---------------------------------------------------------------------------
// Payment mapping
// ---------------------------------------------------------------------------

function mapPayments(
  payments: { type: PaymentType; amount: number; count?: number }[],
): AdePaymentEntry[] {
  const paymentMap = new Map<AdePaymentType, AdePaymentEntry>();

  // Populate from user-provided payments
  for (const p of payments) {
    const adeType = PAYMENT_TYPE_MAP[p.type];
    const entry: AdePaymentEntry = {
      tipo: adeType,
      importo: toAdeAmount(p.amount),
    };
    if (adeType === "TR" && p.count !== undefined) {
      entry.numero = String(p.count);
    }
    paymentMap.set(adeType, entry);
  }

  // Fill all 6 slots with defaults
  return ALL_PAYMENT_SLOTS.map((tipo) => {
    if (paymentMap.has(tipo)) {
      return paymentMap.get(tipo)!;
    }
    const entry: AdePaymentEntry = { tipo, importo: toAdeAmount(0) };
    if (tipo === "TR") {
      entry.numero = "0";
    }
    return entry;
  });
}

// ---------------------------------------------------------------------------
// mapSaleToAdePayload (sez. 9.3, 9.4)
// ---------------------------------------------------------------------------

export function mapSaleToAdePayload(
  doc: SaleDocumentRequest,
  cedentePrestatore: AdeCedentePrestatore,
): AdePayload {
  const elementiContabili = doc.lines.map(computeLineAmounts);

  // Document totals (sez. 3.3)
  const totaleImponibile = elementiContabili.reduce(
    (sum, el) => sum + Number.parseFloat(el.imponibile),
    0,
  );
  const scontoTotale = elementiContabili.reduce(
    (sum, el) => sum + Number.parseFloat(el.scontoLordo),
    0,
  );
  const importoTotaleIva = elementiContabili.reduce(
    (sum, el) => sum + Number.parseFloat(el.importoIVA),
    0,
  );
  const ammontareComplessivo = elementiContabili.reduce(
    (sum, el) => sum + Number.parseFloat(el.totale),
    0,
  );

  const vendita = mapPayments(doc.payments);

  // Non riscosso total
  const nrTypes = new Set<AdePaymentType>(["NR_EF", "NR_PS", "NR_CS"]);
  const totaleNonRiscosso = vendita
    .filter((v) => nrTypes.has(v.tipo))
    .reduce((sum, v) => sum + Number.parseFloat(v.importo), 0);

  const documentoCommerciale: AdeDocumentoCommerciale = {
    cfCessionarioCommittente: doc.customerTaxCode ?? "",
    flagDocCommPerRegalo: doc.isGiftDocument,
    progressivoCollegato: "",
    dataOra: toAdeDate(doc.date),
    multiAttivita: { codiceAttivita: "", descAttivita: "" },
    importoTotaleIva: toAdeAmount8(importoTotaleIva), // 8d (HAR: "0.00000000")
    scontoTotale: toAdeAmount8(scontoTotale), // 8d (HAR: "2.50000000")
    scontoTotaleLordo: toAdeAmount8(scontoTotale), // 8d (HAR: "2.50000000")
    totaleImponibile: toAdeAmount8(totaleImponibile), // 8d (HAR: "5.20000000")
    ammontareComplessivo: toAdeAmount8(ammontareComplessivo), // 8d (HAR: "1.70000000")
    totaleNonRiscosso: toAdeAmount8(totaleNonRiscosso), // 8d (HAR: "0.00000000")
    elementiContabili,
    vendita, // importo a 2d (HAR: "1.70")
    scontoAbbuono: toAdeAmount(doc.globalDiscount), // 2d (HAR: "0.00")
    importoDetraibileDeducibile: toAdeAmount8(doc.deductibleAmount), // 8d (HAR: "0.00000000")
  };

  return {
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore,
    documentoCommerciale,
    flagIdentificativiModificati: false,
  };
}

// ---------------------------------------------------------------------------
// mapVoidToAdePayload (sez. 9.6)
// ---------------------------------------------------------------------------

/**
 * Costruisce il payload AdE per un annullo, usando i dati del documento
 * originale già fetchato via getDocument(idtrx).
 *
 * HAR finding (annullo.har [06]): il portale invia il documento originale
 * completo (elementiContabili con idElementoContabile reali, tutti i totali,
 * cfCessionarioCommittente) e imposta nuovoUtente=true, defAliquotaIVA=""
 * nel cedentePrestatore.
 *
 * Il vecchio approccio (array vuoto + zeri) era completamente sbagliato.
 */
export function mapVoidToAdePayload(
  voidReq: VoidRequest,
  cedentePrestatore: AdeCedentePrestatore,
  originalDoc: AdeDocumentDetail,
): AdePayload {
  const orig = voidReq.originalDocument;

  // HAR fix (annullo.har [06]): per gli annulli il portale invia
  // nuovoUtente=true e defAliquotaIVA="" nel cedentePrestatore.
  const cedente: AdeCedentePrestatore = {
    ...cedentePrestatore,
    altriDatiIdentificativi: {
      ...cedentePrestatore.altriDatiIdentificativi,
      nuovoUtente: true,
      defAliquotaIVA: "",
    },
  };

  const documentoCommerciale: AdeDocumentoCommerciale = {
    // Dati identificativi e flag dal documento originale
    cfCessionarioCommittente: originalDoc.cfCessionarioCommittente,
    flagDocCommPerRegalo: originalDoc.flagDocCommPerRegalo,
    progressivoCollegato: originalDoc.progressivoCollegato,
    dataOra: originalDoc.dataOra, // già in DD/MM/YYYY
    multiAttivita: originalDoc.multiAttivita,

    // Totali monetari dal documento originale (già in formato 8d)
    importoTotaleIva: originalDoc.importoTotaleIva,
    scontoTotale: originalDoc.scontoTotale,
    scontoTotaleLordo: originalDoc.scontoTotaleLordo,
    totaleImponibile: originalDoc.totaleImponibile,
    ammontareComplessivo: originalDoc.ammontareComplessivo,
    totaleNonRiscosso: originalDoc.totaleNonRiscosso,
    scontoAbbuono: originalDoc.scontoAbbuono,
    importoDetraibileDeducibile: originalDoc.importoDetraibileDeducibile,

    // Righe contabili complete (con idElementoContabile reali)
    elementiContabili: originalDoc.elementiContabili,

    // Dati annullo
    resoAnnullo: {
      tipologia: "A",
      dataOra: toAdeDate(orig.date),
      progressivo: orig.documentProgressive,
    },
    numeroProgressivo: orig.documentProgressive,
  };

  return {
    idtrx: orig.transactionId,
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: cedente,
    documentoCommerciale,
    flagIdentificativiModificati: false,
  };
}
