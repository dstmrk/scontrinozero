# Definizione API JSON per Documento Commerciale (caso ScontrinoZero)

Questo documento aggiorna la proposta API JSON usando i file caricati nel repository (`vendita.har`, `annullo.har`) come sorgente reale del tracciato verso AdE.

> Nota operativa: in questa working copy non sono presenti file `.cs` e non è stato possibile fare pull/fetch da `main` verso GitHub (errore rete `CONNECT tunnel failed, response 403`). Le regole sotto sono quindi basate su HAR + codice JS embedded nei HAR.

## Fonti analizzate

- `vendita.har`: invio documento commerciale di vendita.
- `annullo.har`: invio documento di annullo.

Dai tracciati risulta un solo endpoint POST usato dall'applicativo AdE:

- `POST https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/`
- `Content-Type: application/json;charset=UTF-8`

Inoltre, dai payload osservati:

- `datiTrasmissione.formato` è `DCW10`.
- `cedentePrestatore.multiAttivita` e `cedentePrestatore.multiSede` risultano array (vuoti nei casi campione).
- su `documentoCommerciale.vendita[].tipo` compaiono almeno i codici `PC`, `PE`, `TR`, `NR_EF`, `NR_PS`, `NR_CS`.

---

## 1) Correzioni/aggiunte principali emerse dall'analisi

Rispetto alla bozza precedente, ci sono 4 punti importanti da fissare nel contratto API di ScontrinoZero:

1. **Per annullo NON va inviato `vendita[]`** nel `documentoCommerciale`.
2. **Per annullo è presente `idtrx` a livello root**, valorizzato con l'id transazione del documento originale.
3. **Per annullo dentro `elementiContabili[]` compare `idElementoContabile` valorizzato** (id riga originale), non vuoto.
4. I campi importo nel payload AdE sono spesso serializzati come **stringhe decimali** (es. `"2.01000000"`, `"1.00"`), quindi l'adapter deve controllare formattazione e scala.
5. In entrambi i casi analizzati, le righe usano la stessa shape (`elementiContabili[]`); cambia il fatto che in annullo `idElementoContabile` è valorizzato con id riga originale.

---

## 2) Architettura consigliata per il nostro caso

Per ScontrinoZero conviene mantenere due livelli:

1. **Public API ScontrinoZero** (stabile, semplice, business-oriented).
2. **Adapter AdE** (mappa Public DTO -> payload AdE osservato nei HAR).

### Flusso

1. Client chiama API ScontrinoZero.
2. Backend valida e calcola i totali.
3. Adapter costruisce payload AdE (formato `DCW10`).
4. Backend invia POST ad AdE.
5. Backend salva request/response raw e restituisce risposta normalizzata al client.

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

## 4.3 Documento vendita

- `document.date` -> `documentoCommerciale.dataOra` in formato `dd/MM/yyyy`.
- `document.customerTaxCode` -> `cfCessionarioCommittente` (stringa vuota se assente).
- `document.isGiftDocument` -> `flagDocCommPerRegalo`.
- `document.lines[]` -> `elementiContabili[]`.
- `document.payments[]` -> `vendita[]`.
- Totali calcolati server-side e serializzati in stringa decimale con scala coerente con AdE.

Shape minima riga AdE (`elementiContabili[]`) rilevata nei tracciati:

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

- non inviare `vendita[]` nell'annullo;
- popolare `elementiContabili[].idElementoContabile` con gli id riga originali quando disponibili.
- mantenere `elementiContabili[]` con importi coerenti alla riga originaria (nei campioni sono presenti quantità/importi completi, non solo un riferimento).

---

## 5) Validazioni consigliate (nostre API)

- `issuer.vatNumber`: 11 cifre.
- `issuer.taxCode`: 16 caratteri (con gestione casi speciali).
- `document.lines` obbligatorio e non vuoto per vendita.
- `document.payments` obbligatorio per vendita e vietato per annullo.
- Somma pagamenti = totale documento (tolleranza 0.01).
- `idempotencyKey` obbligatorio per endpoint POST.
- `originalDocument.transactionId` e `originalDocument.documentProgressive` obbligatori per annullo.
- `originalDocument.lineReferences[].adeLineId` obbligatorio se si annulla a livello riga (mapping su `idElementoContabile`).
- Data input in ISO (`yyyy-MM-dd`), conversione a `dd/MM/yyyy` solo nell'adapter AdE.

---

## 6) Error model unico lato ScontrinoZero

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

## 7) Persistenza minima consigliata

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

## 8) Checklist implementativa per ScontrinoZero

- [ ] DTO pubblici (`SaleRequest`, `VoidRequest`, `CommercialDocumentResponse`).
- [ ] Validazione con schema condiviso (Zod o equivalente server).
- [ ] Mapper dedicato `mapSaleToAdePayload` e `mapVoidToAdePayload`.
- [ ] Formattatore decimali centralizzato (`toAdeAmount`).
- [ ] Persistenza `ade_line_id` in vendita per annulli successivi.
- [ ] Idempotenza per chiave + hash request.
- [ ] Logging strutturato e redazione dati sensibili.
- [ ] Appena disponibili i `.cs`: verifica completa enum/tipologie e campi opzionali per chiudere gap HAR-only.

---

## 9) Payload AdE osservato nei file caricati

I tracciati confermano:

- risposta standard AdE: `{ "esito": true|false, "idtrx": "...", "progressivo": "...", "errori": [...] }`;
- vendita con `documentoCommerciale.vendita[]`;
- annullo con `idtrx` root + `resoAnnullo` e senza `vendita[]`.

Questo è il comportamento da replicare nell'adapter, mantenendo però un contratto API pubblico più pulito e stabile per le app ScontrinoZero.
