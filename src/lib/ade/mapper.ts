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
// buildCedenteFromBusiness
// ---------------------------------------------------------------------------

/** Campi del business locale necessari per costruire il cedente/prestatore AdE. */
export interface BusinessCedenteData {
  vatNumber: string | null;
  fiscalCode: string | null;
  businessName: string | null;
  address: string | null;
  streetNumber: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  preferredVatCode: string | null;
}

/**
 * Costruisce il cedente/prestatore AdE dai dati locali del business.
 *
 * Imposta `modificati: true` per segnalare all'AdE che stiamo inviando
 * dati di identificazione propri (non quelli memorizzati sul portale).
 * Usato sia per vendita che per annullo al posto di `getFiscalData()`.
 */
export function buildCedenteFromBusiness(
  business: BusinessCedenteData,
): AdeCedentePrestatore {
  return {
    identificativiFiscali: {
      codicePaese: "IT",
      partitaIva: business.vatNumber ?? "",
      codiceFiscale: business.fiscalCode ?? "",
    },
    altriDatiIdentificativi: {
      denominazione: business.businessName ?? "",
      nome: "",
      cognome: "",
      indirizzo: business.address ?? "",
      numeroCivico: business.streetNumber ?? "",
      cap: business.zipCode ?? "",
      comune: business.city ?? "",
      provincia: business.province ?? "",
      nazione: "IT",
      modificati: true,
      defAliquotaIVA: business.preferredVatCode ?? "",
      nuovoUtente: false,
    },
    multiAttivita: [],
    multiSede: [],
  };
}

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
    flagIdentificativiModificati: true,
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

  // HAR finding (annullo.har [04]): i campi monetari sono in documentoCommerciale,
  // non a livello radice. La risposta GET usa precisione variabile (es. "1.7"),
  // il POST richiede 8 decimali — toAdeAmount8(Number(...)) normalizza.
  const docComm = originalDoc.documentoCommerciale;

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
    cfCessionarioCommittente: docComm.cfCessionarioCommittente,
    flagDocCommPerRegalo: docComm.flagDocCommPerRegalo,
    progressivoCollegato: docComm.progressivoCollegato ?? "",
    dataOra: docComm.dataOra, // già in DD/MM/YYYY
    multiAttivita: docComm.multiAttivita ?? {
      codiceAttivita: "",
      descAttivita: "",
    },

    // Totali monetari: GET ha precisione variabile, POST richiede 8 decimali.
    importoTotaleIva: toAdeAmount8(Number(docComm.importoTotaleIva)),
    scontoTotale: toAdeAmount8(Number(docComm.scontoTotale)),
    scontoTotaleLordo: toAdeAmount8(Number(docComm.scontoTotaleLordo)),
    totaleImponibile: toAdeAmount8(Number(docComm.totaleImponibile)),
    ammontareComplessivo: toAdeAmount8(Number(docComm.ammontareComplessivo)),
    totaleNonRiscosso: toAdeAmount8(Number(docComm.totaleNonRiscosso)),
    scontoAbbuono: toAdeAmount(Number(docComm.scontoAbbuono)), // 2d (HAR: "0.00")
    importoDetraibileDeducibile: toAdeAmount8(
      Number(docComm.importoDetraibileDeducibile),
    ),

    // Righe contabili con idElementoContabile reali.
    // HAR finding: il GET usa precisione variabile; il POST richiede la stessa
    // precisione di computeLineAmounts (2d per resiPregressi/reso/quantita, 8d
    // per tutti gli importi). resiPregressi è assente nel GET → aggiunto come "0.00".
    elementiContabili: docComm.elementiContabili.map((el) => ({
      idElementoContabile: el.idElementoContabile,
      resiPregressi: toAdeAmount(0), // 2d — assente nel GET, "0.00"
      reso: toAdeAmount(Number(el.reso)), // 2d
      quantita: toAdeAmount(Number(el.quantita)), // 2d
      descrizioneProdotto: el.descrizioneProdotto,
      prezzoLordo: toAdeAmount8(Number(el.prezzoLordo)), // 8d
      prezzoUnitario: toAdeAmount8(Number(el.prezzoUnitario)), // 8d
      scontoUnitario: toAdeAmount8(Number(el.scontoUnitario)), // 8d
      scontoLordo: toAdeAmount8(Number(el.scontoLordo)), // 8d
      aliquotaIVA: el.aliquotaIVA,
      importoIVA: toAdeAmount8(Number(el.importoIVA)), // 8d
      imponibile: toAdeAmount8(Number(el.imponibile)), // 8d
      imponibileNetto: toAdeAmount8(Number(el.imponibileNetto)), // 8d
      totale: toAdeAmount8(Number(el.totale)), // 8d
      omaggio: el.omaggio,
    })),

    // Dati annullo: usa dataOra dal documento AdE (già DD/MM/YYYY, fonte autorevole)
    resoAnnullo: {
      tipologia: "A",
      dataOra: docComm.dataOra,
      progressivo: orig.documentProgressive,
    },
    numeroProgressivo: orig.documentProgressive,
  };

  return {
    idtrx: orig.transactionId,
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: cedente,
    documentoCommerciale,
    flagIdentificativiModificati: true,
  };
}
