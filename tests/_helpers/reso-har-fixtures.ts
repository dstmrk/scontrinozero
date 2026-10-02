/**
 * Oracoli del reso merce: dettagli GET e POST verbatim del portale AdE
 * (`HAR.md` voce #19). Ogni caso porta il dettaglio della vendita letto PRIMA
 * del reso (`before`, con il cumulativo `reso` di riga), le quantità rese
 * (`quantities`, allineate a `elementiContabili`) e il `documentoCommerciale`
 * che il portale ha trasmesso (`posted`), accettato dall'AdE.
 *
 * Serie 1: vendita a due righe (2 × "doppio" 22% con sconto di riga 0,01 e
 * 1 × "singolo" N2), sconto a pagare 0,01. Serie 2: 3 × "triplo" 22% con sconto
 * di riga 0,01 — il test sui terzi (voce #19c).
 *
 * Nessun dato del cedente: il mapper lo riceve a parte e i payload versionati
 * non devono portare P.IVA o codice fiscale reali.
 */
import type {
  AdeDocumentDetail,
  AdeDocumentoCommerciale,
} from "@/lib/ade/types";

export interface ResoHarCase {
  readonly before: AdeDocumentDetail;
  readonly quantities: readonly number[];
  readonly posted: {
    readonly idtrx: string;
    readonly documentoCommerciale: AdeDocumentoCommerciale;
  };
}

export const serie1Reso1: ResoHarCase = {
  before: {
    idtrx: "247989425",
    documentoCommerciale: {
      scontoAbbuono: "0.01",
      dataOra: "02/10/2026",
      numeroProgressivo: "DCW2026/4801-7890",
      importoTotaleIva: "0.00901639",
      scontoTotale: "0.00819672",
      totaleImponibile: "0.06918033",
      ammontareComplessivo: "0.07",
      importoDetraibileDeducibile: "0",
      vendita: [
        {
          tipo: "PC",
          importo: "0.05",
        },
        {
          tipo: "PE",
          importo: "0.01",
        },
        {
          tipo: "TR",
          importo: "0",
        },
        {
          tipo: "NR_CS",
          importo: "0",
        },
        {
          tipo: "NR_EF",
          importo: "0",
        },
        {
          tipo: "NR_PS",
          importo: "0",
        },
      ],
      elementiContabili: [
        {
          idElementoContabile: "432980277",
          reso: "0.00",
          quantita: "2",
          descrizioneProdotto: "doppio",
          prezzoUnitario: "0.02459016",
          scontoUnitario: "0.00819672",
          imponibile: "0.04918033",
          imponibileNetto: "0.04098361",
          aliquotaIVA: "22",
          importoIVA: "0.00901639",
          totale: "0.05",
          omaggio: "N",
          prezzoLordo: "0.03",
          scontoLordo: "0.01",
        },
        {
          idElementoContabile: "432980278",
          reso: "0.00",
          quantita: "1",
          descrizioneProdotto: "singolo",
          prezzoUnitario: "0.02",
          scontoUnitario: "0",
          imponibile: "0.02",
          imponibileNetto: "0.02",
          aliquotaIVA: "N2",
          importoIVA: "0",
          totale: "0.02",
          omaggio: "N",
          prezzoLordo: "0.02",
          scontoLordo: "0",
        },
      ],
      flagDocCommPerRegalo: false,
      totaleNonRiscosso: "0",
      scontoTotaleLordo: "0.01",
    },
  },
  posted: {
    idtrx: "247989425",
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "02/10/2026",
      multiAttivita: {
        codiceAttivita: "",
        descAttivita: "",
      },
      importoTotaleIva: "0.00450820",
      scontoTotale: "0.00409836",
      scontoTotaleLordo: "0.01000000",
      totaleImponibile: "0.04459016",
      ammontareComplessivo: "0.04500000",
      totaleNonRiscosso: "0.00000000",
      elementiContabili: [
        {
          idElementoContabile: "432980277",
          resiPregressi: "0.00",
          reso: "1.00",
          quantita: "2.00",
          descrizioneProdotto: "doppio",
          prezzoLordo: "0.03000000",
          prezzoUnitario: "0.02459016",
          scontoUnitario: "0.00409836",
          scontoLordo: "0.01000000",
          aliquotaIVA: "22",
          importoIVA: "0.00450820",
          imponibile: "0.02459016",
          imponibileNetto: "0.02049180",
          totale: "0.02500000",
          omaggio: "N",
        },
        {
          idElementoContabile: "432980278",
          resiPregressi: "0.00",
          reso: "1.00",
          quantita: "1.00",
          descrizioneProdotto: "singolo",
          prezzoLordo: "0.02000000",
          prezzoUnitario: "0.02000000",
          scontoUnitario: "0.00000000",
          scontoLordo: "0.00000000",
          aliquotaIVA: "N2",
          importoIVA: "0.00000000",
          imponibile: "0.02000000",
          imponibileNetto: "0.02000000",
          totale: "0.02000000",
          omaggio: "N",
        },
      ],
      scontoAbbuono: "0.01",
      resoAnnullo: {
        tipologia: "R",
        dataOra: "02/10/2026",
        progressivo: "DCW2026/4801-7890",
      },
      numeroProgressivo: "DCW2026/4801-7890",
      importoDetraibileDeducibile: "0.00000000",
    },
  },
  quantities: [1, 1],
};

export const serie1Reso2: ResoHarCase = {
  before: {
    idtrx: "247989425",
    documentoCommerciale: {
      scontoAbbuono: "0.01",
      dataOra: "02/10/2026",
      numeroProgressivo: "DCW2026/4801-7890",
      importoTotaleIva: "0.00901639",
      scontoTotale: "0.00819672",
      totaleImponibile: "0.06918033",
      ammontareComplessivo: "0.07",
      importoDetraibileDeducibile: "0",
      vendita: [
        {
          tipo: "PC",
          importo: "0.05",
        },
        {
          tipo: "PE",
          importo: "0.01",
        },
        {
          tipo: "TR",
          importo: "0",
        },
        {
          tipo: "NR_CS",
          importo: "0",
        },
        {
          tipo: "NR_EF",
          importo: "0",
        },
        {
          tipo: "NR_PS",
          importo: "0",
        },
      ],
      elementiContabili: [
        {
          idElementoContabile: "432980277",
          reso: "1",
          quantita: "2",
          descrizioneProdotto: "doppio",
          prezzoUnitario: "0.02459016",
          scontoUnitario: "0.00819672",
          imponibile: "0.04918033",
          imponibileNetto: "0.04098361",
          aliquotaIVA: "22",
          importoIVA: "0.00901639",
          totale: "0.05",
          omaggio: "N",
          prezzoLordo: "0.03",
          scontoLordo: "0.01",
        },
        {
          idElementoContabile: "432980278",
          reso: "1",
          quantita: "1",
          descrizioneProdotto: "singolo",
          prezzoUnitario: "0.02",
          scontoUnitario: "0",
          imponibile: "0.02",
          imponibileNetto: "0.02",
          aliquotaIVA: "N2",
          importoIVA: "0",
          totale: "0.02",
          omaggio: "N",
          prezzoLordo: "0.02",
          scontoLordo: "0",
        },
      ],
      flagDocCommPerRegalo: false,
      totaleNonRiscosso: "0",
      scontoTotaleLordo: "0.01",
    },
  },
  posted: {
    idtrx: "247989425",
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "02/10/2026",
      multiAttivita: {
        codiceAttivita: "",
        descAttivita: "",
      },
      importoTotaleIva: "0.00450820",
      scontoTotale: "0.00409836",
      scontoTotaleLordo: "0.01000000",
      totaleImponibile: "0.02459016",
      ammontareComplessivo: "0.02500000",
      totaleNonRiscosso: "0.00000000",
      elementiContabili: [
        {
          idElementoContabile: "432980277",
          resiPregressi: "1.00",
          reso: "1.00",
          quantita: "2.00",
          descrizioneProdotto: "doppio",
          prezzoLordo: "0.03000000",
          prezzoUnitario: "0.02459016",
          scontoUnitario: "0.00409836",
          scontoLordo: "0.01000000",
          aliquotaIVA: "22",
          importoIVA: "0.00450820",
          imponibile: "0.02459016",
          imponibileNetto: "0.02049180",
          totale: "0.02500000",
          omaggio: "N",
        },
        {
          idElementoContabile: "432980278",
          resiPregressi: "1.00",
          reso: "0.00",
          quantita: "1.00",
          descrizioneProdotto: "singolo",
          prezzoLordo: "0.02000000",
          prezzoUnitario: "0.02000000",
          scontoUnitario: "0.00000000",
          scontoLordo: "0.00000000",
          aliquotaIVA: "N2",
          importoIVA: "0.00000000",
          imponibile: "0.00000000",
          imponibileNetto: "0.00000000",
          totale: "0.00000000",
          omaggio: "N",
        },
      ],
      scontoAbbuono: "0.01",
      resoAnnullo: {
        tipologia: "R",
        dataOra: "02/10/2026",
        progressivo: "DCW2026/4801-7890",
      },
      numeroProgressivo: "DCW2026/4801-7890",
      importoDetraibileDeducibile: "0.00000000",
    },
  },
  quantities: [1, 0],
};

export const serie2Reso1: ResoHarCase = {
  before: {
    idtrx: "248002948",
    documentoCommerciale: {
      scontoAbbuono: "0",
      dataOra: "02/10/2026",
      numeroProgressivo: "DCW2026/4803-1413",
      importoTotaleIva: "0.00360656",
      scontoTotale: "0.00819672",
      totaleImponibile: "0.02459016",
      ammontareComplessivo: "0.02",
      importoDetraibileDeducibile: "0",
      vendita: [
        {
          tipo: "PC",
          importo: "0.03",
        },
        {
          tipo: "PE",
          importo: "0",
        },
        {
          tipo: "TR",
          importo: "0",
        },
        {
          tipo: "NR_CS",
          importo: "0",
        },
        {
          tipo: "NR_EF",
          importo: "0",
        },
        {
          tipo: "NR_PS",
          importo: "0",
        },
      ],
      elementiContabili: [
        {
          idElementoContabile: "433003714",
          reso: "0.00",
          quantita: "3",
          descrizioneProdotto: "triplo",
          prezzoUnitario: "0.00819672",
          scontoUnitario: "0.00819672",
          imponibile: "0.02459016",
          imponibileNetto: "0.01639344",
          aliquotaIVA: "22",
          importoIVA: "0.00360656",
          totale: "0.02",
          omaggio: "N",
          prezzoLordo: "0.01",
          scontoLordo: "0.01",
        },
      ],
      flagDocCommPerRegalo: false,
      totaleNonRiscosso: "0",
      scontoTotaleLordo: "0.01",
    },
  },
  posted: {
    idtrx: "248002948",
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "02/10/2026",
      multiAttivita: {
        codiceAttivita: "",
        descAttivita: "",
      },
      importoTotaleIva: "0.00120219",
      scontoTotale: "0.00273224",
      scontoTotaleLordo: "0.01000000",
      totaleImponibile: "0.00819672",
      ammontareComplessivo: "0.00666667",
      totaleNonRiscosso: "0.00000000",
      elementiContabili: [
        {
          idElementoContabile: "433003714",
          resiPregressi: "0.00",
          reso: "1.00",
          quantita: "3.00",
          descrizioneProdotto: "triplo",
          prezzoLordo: "0.01000000",
          prezzoUnitario: "0.00819672",
          scontoUnitario: "0.00273224",
          scontoLordo: "0.01000000",
          aliquotaIVA: "22",
          importoIVA: "0.00120219",
          imponibile: "0.00819672",
          imponibileNetto: "0.00546448",
          totale: "0.00666667",
          omaggio: "N",
        },
      ],
      scontoAbbuono: "0.00",
      resoAnnullo: {
        tipologia: "R",
        dataOra: "02/10/2026",
        progressivo: "DCW2026/4803-1413",
      },
      numeroProgressivo: "DCW2026/4803-1413",
      importoDetraibileDeducibile: "0.00000000",
    },
  },
  quantities: [1],
};

export const serie2Reso2: ResoHarCase = {
  before: {
    idtrx: "248002948",
    documentoCommerciale: {
      scontoAbbuono: "0",
      dataOra: "02/10/2026",
      numeroProgressivo: "DCW2026/4803-1413",
      importoTotaleIva: "0.00360656",
      scontoTotale: "0.00819672",
      totaleImponibile: "0.02459016",
      ammontareComplessivo: "0.02",
      importoDetraibileDeducibile: "0",
      vendita: [
        {
          tipo: "PC",
          importo: "0.03",
        },
        {
          tipo: "PE",
          importo: "0",
        },
        {
          tipo: "TR",
          importo: "0",
        },
        {
          tipo: "NR_CS",
          importo: "0",
        },
        {
          tipo: "NR_EF",
          importo: "0",
        },
        {
          tipo: "NR_PS",
          importo: "0",
        },
      ],
      elementiContabili: [
        {
          idElementoContabile: "433003714",
          reso: "1",
          quantita: "3",
          descrizioneProdotto: "triplo",
          prezzoUnitario: "0.00819672",
          scontoUnitario: "0.00819672",
          imponibile: "0.02459016",
          imponibileNetto: "0.01639344",
          aliquotaIVA: "22",
          importoIVA: "0.00360656",
          totale: "0.02",
          omaggio: "N",
          prezzoLordo: "0.01",
          scontoLordo: "0.01",
        },
      ],
      flagDocCommPerRegalo: false,
      totaleNonRiscosso: "0",
      scontoTotaleLordo: "0.01",
    },
  },
  posted: {
    idtrx: "248002948",
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "02/10/2026",
      multiAttivita: {
        codiceAttivita: "",
        descAttivita: "",
      },
      importoTotaleIva: "0.00240437",
      scontoTotale: "0.00546448",
      scontoTotaleLordo: "0.01000000",
      totaleImponibile: "0.01639344",
      ammontareComplessivo: "0.01333333",
      totaleNonRiscosso: "0.00000000",
      elementiContabili: [
        {
          idElementoContabile: "433003714",
          resiPregressi: "1.00",
          reso: "2.00",
          quantita: "3.00",
          descrizioneProdotto: "triplo",
          prezzoLordo: "0.01000000",
          prezzoUnitario: "0.00819672",
          scontoUnitario: "0.00546448",
          scontoLordo: "0.01000000",
          aliquotaIVA: "22",
          importoIVA: "0.00240437",
          imponibile: "0.01639344",
          imponibileNetto: "0.01092896",
          totale: "0.01333333",
          omaggio: "N",
        },
      ],
      scontoAbbuono: "0.00",
      resoAnnullo: {
        tipologia: "R",
        dataOra: "02/10/2026",
        progressivo: "DCW2026/4803-1413",
      },
      numeroProgressivo: "DCW2026/4803-1413",
      importoDetraibileDeducibile: "0.00000000",
    },
  },
  quantities: [2],
};

/** La vendita della serie 1 dopo entrambi i resi: resa per intero (voce #19f). */
export const serie1DopoResi: AdeDocumentDetail = {
  idtrx: "247989425",
  documentoCommerciale: {
    scontoAbbuono: "0.01",
    dataOra: "02/10/2026",
    numeroProgressivo: "DCW2026/4801-7890",
    importoTotaleIva: "0.00901639",
    scontoTotale: "0.00819672",
    totaleImponibile: "0.06918033",
    ammontareComplessivo: "0.07",
    importoDetraibileDeducibile: "0",
    vendita: [
      {
        tipo: "PC",
        importo: "0.05",
      },
      {
        tipo: "PE",
        importo: "0.01",
      },
      {
        tipo: "TR",
        importo: "0",
      },
      {
        tipo: "NR_CS",
        importo: "0",
      },
      {
        tipo: "NR_EF",
        importo: "0",
      },
      {
        tipo: "NR_PS",
        importo: "0",
      },
    ],
    elementiContabili: [
      {
        idElementoContabile: "432980277",
        reso: "2",
        quantita: "2",
        descrizioneProdotto: "doppio",
        prezzoUnitario: "0.02459016",
        scontoUnitario: "0.00819672",
        imponibile: "0.04918033",
        imponibileNetto: "0.04098361",
        aliquotaIVA: "22",
        importoIVA: "0.00901639",
        totale: "0.05",
        omaggio: "N",
        prezzoLordo: "0.03",
        scontoLordo: "0.01",
      },
      {
        idElementoContabile: "432980278",
        reso: "1",
        quantita: "1",
        descrizioneProdotto: "singolo",
        prezzoUnitario: "0.02",
        scontoUnitario: "0",
        imponibile: "0.02",
        imponibileNetto: "0.02",
        aliquotaIVA: "N2",
        importoIVA: "0",
        totale: "0.02",
        omaggio: "N",
        prezzoLordo: "0.02",
        scontoLordo: "0",
      },
    ],
    flagDocCommPerRegalo: false,
    totaleNonRiscosso: "0",
    scontoTotaleLordo: "0.01",
  },
};
