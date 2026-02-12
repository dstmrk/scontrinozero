# Definizione API JSON per Documento Commerciale (caso ScontrinoZero)

Questo documento aggiorna la proposta API JSON usando i tracciati reali presenti in `docs/` (inclusi i nuovi casi di ricerca documento, vendita con lotteria e annullo) e i file C# di supporto (`docs/DC.cs`, `docs/Send.cs`, `docs/Esiti.cs`) come riferimento operativo del flusso verso AdE.

## Fonti analizzate

- `docs/vendita.har`: invio documento commerciale di vendita (caso precedente).
- `docs/annullo.har`: invio documento di annullo (caso precedente).
- `docs/vendita_nuova_lotteria.har`: nuova vendita con `cfCessionarioCommittente` valorizzato (lotteria/codice cliente) e imponibile+IVA ordinaria 22.
- `docs/annullo_nuovo.har`: nuovo annullo collegato alla vendita precedente, con `idtrx` originale e `idElementoContabile` valorizzato.
- `docs/ricerca.har`: chiamate di ricerca/lista/dettaglio su endpoint documenti (`tipoOperazione=V|A|R`).
- `docs/DC.cs`: modello payload JSON, enum/codifiche e serializzazione decimali.
- `docs/Send.cs`: sequenza di autenticazione/sessione e invio POST all'endpoint documenti.
- `docs/Esiti.cs`: shape della risposta AdE mappata lato client.

Endpoint finale di invio confermato:

- `POST https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/` (nel codice viene aggiunto `?v=<unix_ms>`)
- `Content-Type: application/json`

Endpoint osservati lato ricerca/consultazione (nuovo `docs/ricerca.har`):

- `GET /ser/api/documenti/v1/doc/documenti/?...` (lista/paginazione/filtri)
- `GET /ser/api/documenti/v1/doc/documenti/{idtrx}/` (dettaglio documento)
- filtri rilevati: `tipoOperazione=V|A|R`, `numeroProgressivo`, range date (`dataDal`, `dataInvioAl`).

Inoltre dai payload/modelli risulta:

- `datiTrasmissione.formato` = `DCW10`.
- `flagIdentificativiModificati` presente a livello root.
- `cedentePrestatore` contiene `identificativiFiscali` + `altriDatiIdentificativi`.
- su `documentoCommerciale.vendita[].tipo` compaiono almeno `PC`, `PE`, `TR`, `NR_EF`, `NR_PS`, `NR_CS`.
- serializzazione importi come stringa con due decimali (converter custom in C#).

---

## 1) Correzioni/aggiunte principali emerse dall'analisi C#

Rispetto alla bozza precedente, ci sono punti da fissare nel contratto API + adapter:

1. **Annullo senza `vendita[]`** nel `documentoCommerciale`.
2. **Annullo con `idtrx` a livello root** valorizzato con id transazione originale.
3. **Annullo con `elementiContabili[].idElementoContabile` valorizzato** (riferimento riga originale).
4. **Importi serializzati come stringhe decimali a 2 cifre** (`N2`, cultura invariant), non numeri JSON puri.
5. In C# `NullValueHandling.Ignore`: i campi null non vengono inviati. L'adapter deve quindi evitare di forzare proprietà non necessarie.
6. Il modello C# include campi aggiuntivi in `cedentePrestatore.altriDatiIdentificativi`:
   - `modificati`
   - `defAliquotaIVA`
   - `nuovoUtente`
7. Nel `documentoCommerciale` sono previsti anche:
   - `progressivoCollegato`
   - `importoTotaleIva`
   - `scontoTotaleLordo`
   - `totaleImponibile`
   - `ammontareComplessivo`
   - `totaleNonRiscosso`
   - `scontoAbbuono`
   - `importoDetraibileDeducibile`

---

## 2) Architettura consigliata per ScontrinoZero

Mantenere due livelli:

1. **Public API ScontrinoZero** (stabile, semplice, business-oriented).
2. **Adapter AdE** (mappa Public DTO -> payload AdE `DCW10` aderente ai tracciati/C#).

### Flusso tecnico suggerito

1. Client chiama API ScontrinoZero.
2. Backend valida e calcola i totali.
3. Adapter costruisce payload AdE con formattazione importi stringa `N2`.
4. Backend invia POST ad AdE su endpoint documenti.
5. Backend salva request/response raw e restituisce risposta normalizzata.

Nota: il client C# esegue anche una pipeline di autenticazione/sessione (`portale` + scelta utenza + verifica adesione) prima dell'invio JSON. Per noi conviene astrarla nel provider AdE, separata dal mapping business.

---

## 3) Public API proposta

## 3.1 Emissione vendita

### Endpoint

`POST /api/v1/commercial-documents/sales`

### Request JSON

```json
{
  "idempotencyKey": "1f723caf-6501-4ec3-83fd-1e34a728d408",
  "issuer": {
    "countryCode": "IT",
    "vatNumber": "10872631006",
    "taxCode": "DSTMRC86T02H501V",
    "firstName": "MARCO",
    "lastName": "DE STEFANO",
    "address": {
      "street": "CORSO SPEZIA",
      "streetNumber": "22",
      "zipCode": "10126",
      "city": "Torino",
      "province": "TO",
      "nation": "IT"
    }
  },
  "document": {
    "date": "2026-02-11",
    "customerTaxCode": null,
    "isGiftDocument": false,
    "lines": [
      {
        "lineId": "L1",
        "description": "prod",
        "quantity": 1,
        "unitPriceGross": 2.01,
        "unitDiscount": 0.01,
        "vatCode": "N2",
        "isGiftLine": false
      }
    ],
    "payments": [
      { "type": "PC", "amount": 1.0 },
      { "type": "PE", "amount": 1.0 }
    ],
    "globalDiscount": 0.0,
    "deductibleAmount": 0.0
  }
}
```

### Response JSON

```json
{
  "success": true,
  "status": "ACCEPTED",
  "ade": {
    "transactionId": "151085589",
    "documentProgressive": "DCW2026/5111-2188"
  },
  "errors": []
}
```

## 3.2 Annullamento

### Endpoint

`POST /api/v1/commercial-documents/voids`

### Request JSON

```json
{
  "idempotencyKey": "4829f7ad-423a-4f7f-8f6b-5d08a69b3dc8",
  "issuer": {
    "countryCode": "IT",
    "vatNumber": "10872631006",
    "taxCode": "DSTMRC86T02H501V"
  },
  "originalDocument": {
    "transactionId": "151085589",
    "documentProgressive": "DCW2026/5111-2188",
    "date": "2026-02-11",
    "lineReferences": [{ "lineId": "L1", "adeLineId": "264230106" }]
  }
}
```

### Response JSON

```json
{
  "success": true,
  "status": "VOID_ACCEPTED",
  "ade": {
    "transactionId": "151086012",
    "documentProgressive": "DCW2026/5111-2611"
  },
  "errors": []
}
```

---

## 4) Mapping Public API -> AdE JSON

## 4.1 Campi root AdE

Sempre:

```json
"datiTrasmissione": { "formato": "DCW10" }
```

Sempre:

```json
"flagIdentificativiModificati": false
```

Solo annullo:

```json
"idtrx": "<original transaction id>"
```

## 4.2 Issuer

- `issuer.countryCode` -> `cedentePrestatore.identificativiFiscali.codicePaese`
- `issuer.vatNumber` -> `cedentePrestatore.identificativiFiscali.partitaIva`
- `issuer.taxCode` -> `cedentePrestatore.identificativiFiscali.codiceFiscale`
- Dati anagrafici/indirizzo -> `cedentePrestatore.altriDatiIdentificativi.*`
- Campo opzionale/configurabile lato adapter: `defAliquotaIVA`

## 4.3 Documento vendita

- `document.date` -> `documentoCommerciale.dataOra` in formato `dd/MM/yyyy`.
- `document.customerTaxCode` -> `cfCessionarioCommittente` (se supportato dal tracciato corrente).
- `document.isGiftDocument` -> `flagDocCommPerRegalo`.
- `document.lines[]` -> `elementiContabili[]`.
- `document.payments[]` -> `vendita[]`.
- `document.globalDiscount` -> `scontoAbbuono`.
- `document.deductibleAmount` -> `importoDetraibileDeducibile`.

Campi riga rilevati nel modello C# (`elementiContabili[]`):

- `idElementoContabile`
- `descrizioneProdotto`
- `quantita`
- `prezzoLordo`
- `prezzoUnitario`
- `scontoUnitario`
- `scontoLordo`
- `aliquotaIVA`
- `importoIVA`
- `imponibile`
- `imponibileNetto`
- `totale`
- `omaggio`
- `reso`
- `resiPregressi`

## 4.4 Documento annullo

Dentro `documentoCommerciale`:

```json
"resoAnnullo": {
  "tipologia": "A",
  "dataOra": "11/02/2026",
  "progressivo": "DCW2026/5111-2188"
},
"numeroProgressivo": "DCW2026/5111-2188"
```

Inoltre:

- non inviare `vendita[]`;
- popolare `elementiContabili[].idElementoContabile` con gli id riga originali quando disponibili;
- mantenere `elementiContabili[]` con importi coerenti alla riga originaria.

## 4.5 Formattazione importi (obbligatoria nell'adapter)

Dai converter C#:

- decimal/float serializzati come stringa con 2 decimali (`"1.00"`, `"2.01"`);
- separatore decimale `.`;
- nessun separatore migliaia;
- raccomandato standardizzare helper unico, es. `toAdeAmount(value: number): string`.

---

## 5) Codifiche IVA/Natura: evidenze da HAR + C#

Evidenze concrete nei tracciati HAR aggiornati:

- in `docs/vendita_nuova_lotteria.har` e `docs/annullo_nuovo.har` le righe usano `aliquotaIVA: "22"` (IVA ordinaria) e `defAliquotaIVA: "N4"` nei dati fiscali esercente;
- in `docs/ricerca.har` (dettaglio di un documento precedente) compare `aliquotaIVA: "N2"` sulla riga prodotto;
- nei payload analizzati non compaiono esempi operativi con `N1`, `N3`, `N5`, `N6`, `N7` come aliquota riga.

Evidenze da modello C# (`docs/DC.cs`):

- enum/whitelist previsti: IVA ordinaria `4`, `5`, `10`, `22` e natura `N1`..`N7`.

Conclusione operativa sul mapping N1..N7:

- dai **nuovi HAR** non emerge la semantica descrittiva completa di ciascun codice (`N1`..`N7`), ma solo l'uso reale di `N2` (riga documento) e `N4` (default aliquota);
- per il mapping fiscale definitivo conviene mantenere la whitelist tecnica (`N1`..`N7`) e completare la tabella descrittiva con casi di emissione mirati per ogni natura (come anticipato).

---

## 6) Validazioni consigliate (nostre API)

- `issuer.vatNumber`: 11 cifre.
- `issuer.taxCode`: 16 caratteri (con gestione casi speciali).
- `document.lines` obbligatorio e non vuoto per vendita.
- `document.payments` obbligatorio per vendita e vietato per annullo.
- Somma pagamenti = totale documento (tolleranza 0.01).
- `idempotencyKey` obbligatorio per endpoint POST.
- `originalDocument.transactionId` e `originalDocument.documentProgressive` obbligatori per annullo.
- `originalDocument.lineReferences[].adeLineId` obbligatorio se si annulla a livello riga.
- Data input in ISO (`yyyy-MM-dd`), conversione a `dd/MM/yyyy` solo nell'adapter AdE.
- Importi normalizzati prima dell'invio AdE in formato stringa a due decimali.

---

## 7) Error model unico lato ScontrinoZero

Shape AdE confermato da `docs/Esiti.cs`:

```json
{
  "esito": true,
  "idtrx": "151085589",
  "progressivo": "DCW2026/5111-2188",
  "errori": [
    {
      "codice": "...",
      "descrizione": "..."
    }
  ]
}
```

Errore normalizzato lato API pubblica:

```json
{
  "success": false,
  "status": "REJECTED",
  "errors": [
    {
      "code": "ADE_VALIDATION_ERROR",
      "message": "Errore restituito da AdE",
      "field": "document.lines[0].vatCode"
    }
  ]
}
```

Mappatura HTTP:

- 200: invio accettato da AdE.
- 422: validazione business o rifiuto funzionale.
- 503: errore tecnico temporaneo AdE (retry controllato).

---

## 8) Persistenza minima consigliata

Tabella `commercial_documents`:

- `id` (uuid)
- `kind` (`SALE` | `VOID`)
- `idempotency_key`
- `issuer_vat`
- `public_request_json`
- `ade_request_json`
- `ade_response_json`
- `ade_transaction_id`
- `ade_progressive`
- `status`
- `created_at`
- `updated_at`

Tabella `commercial_document_lines`:

- `id` (uuid)
- `document_id` (fk)
- `public_line_id`
- `ade_line_id` (per riuso in annullo)
- `description`
- `qty`
- `gross_unit_price`
- `vat_code`

---

## 9) Checklist implementativa per ScontrinoZero

- [ ] DTO pubblici (`SaleRequest`, `VoidRequest`, `CommercialDocumentResponse`).
- [ ] Validazione con schema condiviso (Zod o equivalente server).
- [ ] Mapper dedicato `mapSaleToAdePayload` e `mapVoidToAdePayload`.
- [ ] Formattatore decimali centralizzato (`toAdeAmount`).
- [ ] Persistenza `ade_line_id` in vendita per annulli successivi.
- [ ] Idempotenza per chiave + hash request.
- [ ] Logging strutturato e redazione dati sensibili.
- [ ] Provider AdE separato per gestione sessione/autenticazione e invio.

---

## 10) Nota operativa su invio multiplo

Il metodo C# `SendDC` accetta `List<DC.RootObject>` e invia i documenti uno per volta nello stesso contesto di sessione, restituendo `List<Esiti.Esito>`.

Per ScontrinoZero è consigliato mantenere endpoint pubblici single-document (più semplici e idempotenti) ma prevedere internamente una pipeline batch-safe, in modo da poter riusare connessioni/sessione verso AdE.
