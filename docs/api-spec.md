# ScontrinoZero — Specifica API

Questo documento descrive le API pubbliche di ScontrinoZero e il mapping verso
gli endpoint dell'Agenzia delle Entrate (AdE) per il Documento Commerciale Online.

---

## 1. Autenticazione AdE (Fisconline)

### 1.1 Flusso di sessione (6 fasi)

Il backend deve eseguire queste chiamate in sequenza per ottenere una sessione
autenticata sul portale AdE. Tutte le chiamate condividono lo stesso cookie jar.

| Fase | Metodo | URL                                                                                                                                                                                                                                                                              | Content-Type                        | Scopo                                |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------ |
| 1    | GET    | `/portale/web/guest`                                                                                                                                                                                                                                                             | —                                   | Inizializza cookie jar               |
| 2    | POST   | `/portale/home?p_p_id=58&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_pos=3&p_p_col_count=4&_58_struts_action=%2Flogin%2Flogin`                                                                                                                    | `application/x-www-form-urlencoded` | Login                                |
| 3    | GET    | `/dp/api?v={unix_ms}`                                                                                                                                                                                                                                                            | —                                   | Bootstrap sessione                   |
| 4    | POST   | `/portale/scelta-utenza-lavoro?p_auth={token}&p_p_id=SceltaUtenzaLavoro_WAR_SceltaUtenzaLavoroportlet&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_count=1&_SceltaUtenzaLavoro_WAR_SceltaUtenzaLavoroportlet_javax.portlet.action=incarichiAction` | `application/x-www-form-urlencoded` | Seleziona P.IVA                      |
| 5    | GET    | `/ser/api/fatture/v1/ul/me/adesione/stato/`                                                                                                                                                                                                                                      | —                                   | Verifica sessione READY              |
| 6    | —      | —                                                                                                                                                                                                                                                                                | —                                   | Sessione pronta per le API documenti |

Base URL: `https://ivaservizi.agenziaentrate.gov.it`

### 1.2 Credenziali login (Fase 2)

Campi form:

| Campo          | Valore              | Note                      |
| -------------- | ------------------- | ------------------------- |
| `_58_login`    | Codice fiscale      | 16 caratteri alfanumerici |
| `_58_password` | Password Fisconline |                           |
| `_58_pin`      | PIN Fisconline      |                           |

### 1.3 Token Liferay `p_auth` (Fase 3 → 4)

Dopo il login, la pagina HTML contiene:

```javascript
Liferay.authToken = "{p_auth}";
```

Questo token va estratto con parsing stringa e usato nella query string della Fase 4.

### 1.4 Selezione utenza (Fase 4)

Campi form:

| Campo             | Valore        | Note                 |
| ----------------- | ------------- | -------------------- |
| `sceltaincarico`  | Partita IVA   | 11 cifre             |
| `tipoincaricante` | Tipo incarico | Es. `ME` (sé stesso) |

### 1.5 Login riuscito vs fallito

|                   | Successo              | Fallimento                         |
| ----------------- | --------------------- | ---------------------------------- |
| Status code POST  | 302                   | 302                                |
| Location header   | `/portale/c`          | `/portale/home?p_p_id=58...`       |
| Pagina successiva | `isSignedIn = "true"` | `isSignedIn = "false"`             |
| Messaggio         | —                     | `Autenticazione fallita. Riprova.` |

**Attenzione**: entrambi i casi restituiscono 302. Verificare il Location header.

### 1.6 Logout

Chiamate GET in sequenza (best-effort):

1. `/cons/opt-services/logout`
2. `/cons/cons-services/logout`
3. `/cons/cons-other-services/logout`
4. `/cons/mass-services/logout`
5. `/portale/c/portal/logout` → redirect → `/dp/logout` → `/portale/logout`

### 1.7 Gestione sessione

- Cookie jar condiviso per tutta la durata della sessione
- Cookie principali: `JSESSIONID` + cookie Liferay/OpenAM (gestiti automaticamente)
- Ready probe: `GET /ser/api/fatture/v1/ul/me/adesione/stato/` deve restituire 200
- Su 401 durante invio: re-bootstrap completo (Fasi 1-5) + retry
- Non serializzare mai cookie/token nei log

---

## 2. API AdE — Documenti Commerciali

Base path: `/ser/api/documenti/v1/doc`

### 2.1 Endpoint

| Metodo   | Path                                                             | Scopo                             |
| -------- | ---------------------------------------------------------------- | --------------------------------- |
| **POST** | `/documenti/?v={unix_ms}`                                        | Emissione vendita o annullo       |
| GET      | `/documenti/?dataDal=...&dataInvioAl=...&tipoOperazione=V\|A\|R` | Ricerca                           |
| GET      | `/documenti/{idtrx}/`                                            | Dettaglio documento               |
| GET      | `/documenti/{idtrx}/stampa/?regalo={bool}`                       | Download PDF                      |
| GET      | `/documenti/ultimo/`                                             | Ultimo documento (404 se nessuno) |
| GET      | `/documenti/dati/fiscali`                                        | Dati fiscali dell'esercente       |

### 2.2 Rubrica prodotti

| Metodo | Path                     | Scopo                     |
| ------ | ------------------------ | ------------------------- |
| GET    | `/rubrica/prodotti`      | Lista prodotti            |
| POST   | `/rubrica/prodotti`      | Creazione (accetta array) |
| PUT    | `/rubrica/prodotti`      | Modifica prodotto         |
| DELETE | `/rubrica/prodotti/{id}` | Cancellazione prodotto    |

### 2.3 Info utente

| Metodo | Path                                     | Scopo                   |
| ------ | ---------------------------------------- | ----------------------- |
| GET    | `/common/testata/v1/info/me`             | Info utente autenticato |
| GET    | `/ser/api/messaggistica/v1/ul/me/totale` | Notifiche               |

### 2.4 Headers richiesti per POST documenti

```
Accept: application/json, text/plain, */*
Content-Type: application/json;charset=UTF-8
Origin: https://ivaservizi.agenziaentrate.gov.it
User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36
X-Content-Type-Options: nosniff
X-Frame-Options: deny
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=16070400; includeSubDomains
```

### 2.5 Risposta AdE

```json
{
  "esito": true,
  "idtrx": "151085589",
  "progressivo": "DCW2026/5111-2188",
  "errori": []
}
```

In caso di errore:

```json
{
  "esito": false,
  "idtrx": null,
  "progressivo": null,
  "errori": [{ "codice": "...", "descrizione": "..." }]
}
```

---

## 3. Payload AdE — Vendita

```json
{
  "datiTrasmissione": {
    "formato": "DCW10"
  },
  "cedentePrestatore": {
    "identificativiFiscali": {
      "codicePaese": "IT",
      "partitaIva": "XXXXXXXXXXX",
      "codiceFiscale": "XXXXXXXXXXXXXXXX"
    },
    "altriDatiIdentificativi": {
      "denominazione": "",
      "nome": "MARIO",
      "cognome": "ROSSI",
      "indirizzo": "VIA ROMA",
      "numeroCivico": "1",
      "cap": "00100",
      "comune": "ROMA",
      "provincia": "RM",
      "nazione": "IT",
      "modificati": false,
      "defAliquotaIVA": "22",
      "nuovoUtente": false
    },
    "multiAttivita": [],
    "multiSede": []
  },
  "documentoCommerciale": {
    "cfCessionarioCommittente": "",
    "flagDocCommPerRegalo": false,
    "progressivoCollegato": "",
    "dataOra": "15/02/2026",
    "multiAttivita": {
      "codiceAttivita": "",
      "descAttivita": ""
    },
    "importoTotaleIva": "0.00",
    "scontoTotale": "0.00",
    "scontoTotaleLordo": "0.00",
    "totaleImponibile": "10.00",
    "ammontareComplessivo": "10.00",
    "totaleNonRiscosso": "0.00",
    "elementiContabili": [
      {
        "idElementoContabile": "",
        "resiPregressi": "0.00",
        "reso": "0.00",
        "quantita": "1.00",
        "descrizioneProdotto": "Prodotto esempio",
        "prezzoLordo": "10.00",
        "prezzoUnitario": "10.00",
        "scontoUnitario": "0.00",
        "scontoLordo": "0.00",
        "aliquotaIVA": "N2",
        "importoIVA": "0.00",
        "imponibile": "10.00",
        "imponibileNetto": "10.00",
        "totale": "10.00",
        "omaggio": "N"
      }
    ],
    "vendita": [
      { "tipo": "PC", "importo": "10.00" },
      { "tipo": "PE", "importo": "0.00" },
      { "tipo": "TR", "importo": "0.00", "numero": "0" },
      { "tipo": "NR_EF", "importo": "0.00" },
      { "tipo": "NR_PS", "importo": "0.00" },
      { "tipo": "NR_CS", "importo": "0.00" }
    ],
    "scontoAbbuono": "0.00",
    "importoDetraibileDeducibile": "0.00"
  },
  "flagIdentificativiModificati": false
}
```

### 3.1 Campi riga contabile (`elementiContabili[]`)

| Campo                 | Tipo   | Descrizione                                          |
| --------------------- | ------ | ---------------------------------------------------- |
| `idElementoContabile` | string | Vuoto in vendita, valorizzato in annullo             |
| `resiPregressi`       | string | Sempre `"0.00"` in vendita                           |
| `reso`                | string | Sempre `"0.00"` in vendita                           |
| `quantita`            | string | Quantita con 2 decimali (es. `"1.00"`)               |
| `descrizioneProdotto` | string | Max 1000 caratteri                                   |
| `prezzoLordo`         | string | Prezzo lordo unitario (= `prezzoUnitario` per qty=1) |
| `prezzoUnitario`      | string | Prezzo unitario IVA esclusa (o lordo se natura N\*)  |
| `scontoUnitario`      | string | Sconto per unita                                     |
| `scontoLordo`         | string | Sconto lordo totale riga                             |
| `aliquotaIVA`         | string | Codice aliquota/natura (vedi sez. 6)                 |
| `importoIVA`          | string | Importo IVA calcolato                                |
| `imponibile`          | string | Imponibile lordo (prima dello sconto)                |
| `imponibileNetto`     | string | Imponibile netto (dopo sconto)                       |
| `totale`              | string | Totale riga (imponibileNetto + importoIVA)           |
| `omaggio`             | string | `"N"` o `"Y"`                                        |

### 3.2 Calcolo importi per riga

```
prezzoLordo = prezzoUnitario (quando qty = 1)
imponibile = prezzoLordo
imponibileNetto = imponibile - scontoLordo
importoIVA = imponibileNetto * aliquota / 100  (0 per nature N*)
totale = imponibileNetto + importoIVA
```

### 3.3 Calcolo totali documento

```
totaleImponibile = somma(imponibile) di tutte le righe
scontoTotale = somma(scontoLordo) di tutte le righe
scontoTotaleLordo = scontoTotale
importoTotaleIva = somma(importoIVA) di tutte le righe
ammontareComplessivo = somma(totale) di tutte le righe
totaleNonRiscosso = somma importi NR_EF + NR_PS + NR_CS
```

### 3.4 Vincolo pagamenti

```
somma(PC + PE + TR) = ammontareComplessivo - totaleNonRiscosso - scontoAbbuono
```

---

## 4. Payload AdE — Annullo

Differenze rispetto alla vendita:

| Aspetto                                   | Vendita  | Annullo                  |
| ----------------------------------------- | -------- | ------------------------ |
| `idtrx` (root)                            | Assente  | ID transazione originale |
| `resoAnnullo`                             | Assente  | Presente                 |
| `numeroProgressivo`                       | Assente  | Progressivo originale    |
| `vendita[]`                               | Presente | **Assente**              |
| `elementiContabili[].idElementoContabile` | `""`     | ID riga originale        |

### 4.1 Campi aggiuntivi annullo

In `documentoCommerciale`:

```json
{
  "resoAnnullo": {
    "tipologia": "A",
    "dataOra": "15/02/2026",
    "progressivo": "DCW2026/5111-2188"
  },
  "numeroProgressivo": "DCW2026/5111-2188"
}
```

A livello root:

```json
{
  "idtrx": "151085589",
  ...
}
```

---

## 5. Tipi e codifiche

### 5.1 Tipi operazione

| Codice | Descrizione                                  |
| ------ | -------------------------------------------- |
| `V`    | Vendita                                      |
| `A`    | Annullo (documenti generati online)          |
| `AX`   | Annullo esterno (documenti da altri sistemi) |
| `R`    | Reso (documenti generati online)             |
| `RX`   | Reso esterno (documenti da altri sistemi)    |

### 5.2 Tipi pagamento (`vendita[].tipo`)

| Codice  | Descrizione                            |
| ------- | -------------------------------------- |
| `PC`    | Pagamento contanti                     |
| `PE`    | Pagamento elettronico                  |
| `TR`    | Ticket restaurant (con campo `numero`) |
| `NR_EF` | Non riscosso — emissione fattura       |
| `NR_PS` | Non riscosso — prestazioni servizi     |
| `NR_CS` | Non riscosso — credito cessione bene   |

### 5.3 Omaggio

| Codice | Descrizione |
| ------ | ----------- |
| `N`    | Non omaggio |
| `Y`    | Omaggio     |

---

## 6. Codifiche IVA / Natura

Pattern di validazione frontend AdE:

```
^(N1|N2|N3|N4|N5|N6|4|5|10|22|2|6\.4|7|7\.3|7\.5|7\.65|7\.95|8\.3|8\.5|8\.8|9\.5|12\.3)$
```

### 6.1 Aliquote ordinarie

| Codice | Descrizione |
| ------ | ----------- |
| `4`    | 4%          |
| `5`    | 5%          |
| `10`   | 10%         |
| `22`   | 22%         |

### 6.2 Nature (operazioni senza IVA)

| Codice | Descrizione        |
| ------ | ------------------ |
| `N1`   | Escluse ex art. 15 |
| `N2`   | Non soggette       |
| `N3`   | Non imponibili     |
| `N4`   | Esenti             |
| `N5`   | Regime del margine |
| `N6`   | Altro non IVA      |

Per le nature N1-N6, `importoIVA` = `"0.00"` e `prezzoUnitario` = `prezzoLordo`.

### 6.3 Percentuali compensazione agricoltura

| Codice | Descrizione |
| ------ | ----------- |
| `2`    | 2%          |
| `6.4`  | 6,4%        |
| `7`    | 7%          |
| `7.3`  | 7,3%        |
| `7.5`  | 7,5%        |
| `7.65` | 7,65%       |
| `7.95` | 7,95%       |
| `8.3`  | 8,3%        |
| `8.5`  | 8,5%        |
| `8.8`  | 8,8%        |
| `9.5`  | 9,5%        |
| `12.3` | 12,3%       |

---

## 7. Formattazione importi

Tutti gli importi nel payload AdE sono **stringhe** con 2 decimali:

| Esempio                 | Valore   |
| ----------------------- | -------- |
| Un euro                 | `"1.00"` |
| Due euro e un centesimo | `"2.01"` |
| Zero                    | `"0.00"` |

Regole:

- Separatore decimale: `.` (punto)
- Nessun separatore migliaia
- Sempre 2 decimali
- Helper consigliato: `toAdeAmount(value: number): string`

Nota: nei tracciati HAR alcuni campi computati appaiono con 8 decimali
(`"2.01000000"`). L'implementazione di riferimento usa 2 decimali. Entrambi
sono accettati dal server, ma usiamo 2 per coerenza.

---

## 8. API pubbliche ScontrinoZero

### 8.1 Emissione vendita

`POST /api/v1/commercial-documents/sales`

Request:

```json
{
  "idempotencyKey": "uuid-v4",
  "document": {
    "date": "2026-02-15",
    "customerTaxCode": null,
    "isGiftDocument": false,
    "lines": [
      {
        "description": "Cappuccino",
        "quantity": 2,
        "unitPriceGross": 1.5,
        "unitDiscount": 0.0,
        "vatCode": "10",
        "isGift": false
      }
    ],
    "payments": [{ "type": "CASH", "amount": 3.0 }],
    "globalDiscount": 0.0,
    "deductibleAmount": 0.0
  }
}
```

Response (200):

```json
{
  "success": true,
  "status": "ACCEPTED",
  "transactionId": "151085589",
  "documentProgressive": "DCW2026/5111-2188",
  "errors": []
}
```

### 8.2 Annullamento

`POST /api/v1/commercial-documents/voids`

Request:

```json
{
  "idempotencyKey": "uuid-v4",
  "originalDocument": {
    "transactionId": "151085589",
    "documentProgressive": "DCW2026/5111-2188",
    "date": "2026-02-15"
  }
}
```

Response (200):

```json
{
  "success": true,
  "status": "VOID_ACCEPTED",
  "transactionId": "151086012",
  "documentProgressive": "DCW2026/5111-2611",
  "errors": []
}
```

### 8.3 Recupero documento

`GET /api/v1/commercial-documents/{transactionId}`

### 8.4 Download PDF

`GET /api/v1/commercial-documents/{transactionId}/pdf`

### 8.5 Error model

Response errore (422):

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

Codici HTTP:

- 200: invio accettato
- 400: validazione input
- 422: rifiuto funzionale / errore AdE
- 503: errore tecnico temporaneo AdE

---

## 9. Mapping API pubblica → payload AdE

### 9.1 Campi root (sempre presenti)

| API pubblica | Payload AdE                              |
| ------------ | ---------------------------------------- |
| —            | `datiTrasmissione.formato` = `"DCW10"`   |
| —            | `flagIdentificativiModificati` = `false` |

### 9.2 Dati esercente

I dati del cedente/prestatore vengono recuperati da
`GET /ser/api/documenti/v1/doc/documenti/dati/fiscali` e inclusi nel payload.
L'utente non li passa nella request pubblica.

### 9.3 Documento vendita

| API pubblica                       | Payload AdE                                   |
| ---------------------------------- | --------------------------------------------- |
| `document.date` (ISO `yyyy-MM-dd`) | `documentoCommerciale.dataOra` (`dd/MM/yyyy`) |
| `document.customerTaxCode`         | `cfCessionarioCommittente`                    |
| `document.isGiftDocument`          | `flagDocCommPerRegalo`                        |
| `document.lines[]`                 | `elementiContabili[]`                         |
| `document.payments[]`              | `vendita[]`                                   |
| `document.globalDiscount`          | `scontoAbbuono`                               |
| `document.deductibleAmount`        | `importoDetraibileDeducibile`                 |

### 9.4 Riga contabile

| API pubblica          | Payload AdE                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `line.description`    | `descrizioneProdotto`                                                       |
| `line.quantity`       | `quantita`                                                                  |
| `line.unitPriceGross` | `prezzoLordo` + `prezzoUnitario`                                            |
| `line.unitDiscount`   | `scontoUnitario` + `scontoLordo`                                            |
| `line.vatCode`        | `aliquotaIVA`                                                               |
| `line.isGift`         | `omaggio` (`"Y"` / `"N"`)                                                   |
| — (calcolato)         | `importoIVA`, `imponibile`, `imponibileNetto`, `totale`                     |
| — (default)           | `idElementoContabile` = `""`, `resiPregressi` = `"0.00"`, `reso` = `"0.00"` |

### 9.5 Pagamenti

| API pubblica            | Payload AdE         |
| ----------------------- | ------------------- |
| `CASH`                  | `PC`                |
| `ELECTRONIC`            | `PE`                |
| `MEAL_VOUCHER`          | `TR` (con `numero`) |
| `NOT_COLLECTED_INVOICE` | `NR_EF`             |
| `NOT_COLLECTED_SERVICE` | `NR_PS`             |
| `NOT_COLLECTED_CREDIT`  | `NR_CS`             |

### 9.6 Annullo

| API pubblica                           | Payload AdE                                       |
| -------------------------------------- | ------------------------------------------------- |
| `originalDocument.transactionId`       | `idtrx` (root)                                    |
| `originalDocument.documentProgressive` | `resoAnnullo.progressivo` + `numeroProgressivo`   |
| `originalDocument.date`                | `resoAnnullo.dataOra` (convertito a `dd/MM/yyyy`) |
| —                                      | `resoAnnullo.tipologia` = `"A"`                   |

---

## 10. Validazioni API pubblica

| Campo                                  | Regola                                      |
| -------------------------------------- | ------------------------------------------- |
| `idempotencyKey`                       | UUID v4 obbligatorio                        |
| `document.date`                        | ISO 8601 (`yyyy-MM-dd`)                     |
| `document.lines`                       | Array non vuoto (vendita)                   |
| `document.lines[].quantity`            | > 0                                         |
| `document.lines[].unitPriceGross`      | >= 0                                        |
| `document.lines[].vatCode`             | Uno dei codici in sezione 6                 |
| `document.lines[].description`         | Max 1000 caratteri                          |
| `document.payments`                    | Obbligatorio in vendita, vietato in annullo |
| Somma pagamenti                        | = totale documento (tolleranza 0.01)        |
| `originalDocument.transactionId`       | Obbligatorio per annullo                    |
| `originalDocument.documentProgressive` | Obbligatorio per annullo                    |

---

## 11. Persistenza

### Tabella `commercial_documents`

| Colonna              | Tipo        | Note                                       |
| -------------------- | ----------- | ------------------------------------------ |
| `id`                 | uuid        | PK                                         |
| `user_id`            | uuid        | FK → auth.users                            |
| `kind`               | enum        | `SALE`, `VOID`                             |
| `idempotency_key`    | uuid        | Unique                                     |
| `public_request`     | jsonb       | Payload API pubblica                       |
| `ade_request`        | jsonb       | Payload inviato ad AdE                     |
| `ade_response`       | jsonb       | Risposta AdE raw                           |
| `ade_transaction_id` | text        | `idtrx` AdE                                |
| `ade_progressive`    | text        | `progressivo` AdE                          |
| `status`             | enum        | `PENDING`, `ACCEPTED`, `REJECTED`, `ERROR` |
| `created_at`         | timestamptz |                                            |
| `updated_at`         | timestamptz |                                            |

### Tabella `commercial_document_lines`

| Colonna            | Tipo    | Note                              |
| ------------------ | ------- | --------------------------------- |
| `id`               | uuid    | PK                                |
| `document_id`      | uuid    | FK → commercial_documents         |
| `line_index`       | int     | Ordine riga                       |
| `description`      | text    |                                   |
| `quantity`         | numeric |                                   |
| `gross_unit_price` | numeric |                                   |
| `vat_code`         | text    |                                   |
| `ade_line_id`      | text    | `idElementoContabile` per annulli |

---

## 12. Architettura adapter

```
Client → API pubblica ScontrinoZero → Validazione (Zod)
  → Mapper (mapSaleToAdePayload / mapVoidToAdePayload)
  → AdeClient (interfaccia)
    ├── RealAdeClient (HTTP verso AdE)
    └── MockAdeClient (simula risposta, stessa logica senza HTTP)
  → Persistenza (ade_request + ade_response)
  → Risposta normalizzata al client
```

Il `RealAdeClient` gestisce internamente:

- Cookie jar per sessione
- Login Fisconline (6 fasi)
- Retry con re-auth su 401
- Logout a fine batch

Controllato da `ADE_MODE=real|mock` (variabile d'ambiente).
