/**
 * Mapper: API pubblica → payload AdE.
 *
 * Reference: docs/api-spec.md sez. 9
 */

import type {
  AdeCedentePrestatore,
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
    resiPregressi: toAdeAmount(0),
    reso: toAdeAmount(0),
    quantita: toAdeAmount(line.quantity),
    descrizioneProdotto: line.description,
    prezzoLordo: toAdeAmount(grossTotal),
    prezzoUnitario: toAdeAmount(prezzoUnitario),
    scontoUnitario: toAdeAmount(line.unitDiscount),
    scontoLordo: toAdeAmount(discountTotal),
    aliquotaIVA: line.vatCode,
    importoIVA: toAdeAmount(importoIVA),
    imponibile: toAdeAmount(imponibile),
    imponibileNetto: toAdeAmount(imponibileNetto),
    totale: toAdeAmount(netGross),
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
    importoTotaleIva: toAdeAmount(importoTotaleIva),
    scontoTotale: toAdeAmount(scontoTotale),
    scontoTotaleLordo: toAdeAmount(scontoTotale),
    totaleImponibile: toAdeAmount(totaleImponibile),
    ammontareComplessivo: toAdeAmount(ammontareComplessivo),
    totaleNonRiscosso: toAdeAmount(totaleNonRiscosso),
    elementiContabili,
    vendita,
    scontoAbbuono: toAdeAmount(doc.globalDiscount),
    importoDetraibileDeducibile: toAdeAmount(doc.deductibleAmount),
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

export function mapVoidToAdePayload(
  voidReq: VoidRequest,
  cedentePrestatore: AdeCedentePrestatore,
): AdePayload {
  const orig = voidReq.originalDocument;

  const documentoCommerciale: AdeDocumentoCommerciale = {
    cfCessionarioCommittente: "",
    flagDocCommPerRegalo: false,
    progressivoCollegato: "",
    dataOra: toAdeDate(orig.date),
    multiAttivita: { codiceAttivita: "", descAttivita: "" },
    importoTotaleIva: toAdeAmount(0),
    scontoTotale: toAdeAmount(0),
    scontoTotaleLordo: toAdeAmount(0),
    totaleImponibile: toAdeAmount(0),
    ammontareComplessivo: toAdeAmount(0),
    totaleNonRiscosso: toAdeAmount(0),
    elementiContabili: [],
    resoAnnullo: {
      tipologia: "A",
      dataOra: toAdeDate(orig.date),
      progressivo: orig.documentProgressive,
    },
    numeroProgressivo: orig.documentProgressive,
    scontoAbbuono: toAdeAmount(0),
    importoDetraibileDeducibile: toAdeAmount(0),
  };

  return {
    idtrx: orig.transactionId,
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore,
    documentoCommerciale,
    flagIdentificativiModificati: false,
  };
}
