# Definizione API JSON per Documento Commerciale (caso ScontrinoZero)

Questo documento aggiorna la proposta API JSON usando i tracciati reali presenti in `docs/` (inclusi i nuovi casi di ricerca documento, vendita con lotteria, annullo e rubrica prodotti), il mapping HTML delle aliquote IVA e i file C# di supporto (`docs/DC.cs`, `docs/Send.cs`, `docs/Esiti.cs`) come riferimento operativo del flusso verso AdE.

## Fonti analizzate

- `docs/vendita.har`: invio documento commerciale di vendita (caso precedente).
- `docs/annullo.har`: invio documento di annullo (caso precedente).
- `docs/vendita_nuova_lotteria.har`: nuova vendita con `cfCessionarioCommittente` valorizzato (lotteria/codice cliente) e imponibile+IVA ordinaria 22.
- `docs/annullo_nuovo.har`: nuovo annullo collegato alla vendita precedente, con `idtrx` originale e `idElementoContabile` valorizzato.
- `docs/ricerca.har`: chiamate di ricerca/lista/dettaglio su endpoint documenti (`tipoOperazione=V|A|R`).
- `docs/rubrica_prodotti.har`: creazione massiva di prodotti in rubrica (`POST /rubrica/prodotti`) e verifica lista aggiornata.
- `docs/modifica_cancellazione.har`: modifica (`PUT`) e cancellazione (`DELETE /rubrica/prodotti/{id}`) prodotto rubrica.
- `docs/login_cie_redacted.har`: login reale con CIE + bootstrap sessione su portale AdE.
- `docs/logout_redacted.har`: sequenza di logout con chiusura sessione portale/servizi correlati.
- `docs/aliquote_iva.md`: HTML reale della select aliquote/nature con pattern di validazione e label descrittive.
- `docs/examplejson.md`: esempio payload esterno utile per evidenziare varianti reali sui dati fiscali (es. `codiceFiscale` numerico da 11 cifre e `cfCessionarioCommittente` non a 16 caratteri).
- `docs/151247931_vendita.pdf`, `docs/151248248_annullamento.pdf`: esempi output PDF di documento commerciale (vendita/annullo) da conservare come riferimento per controlli post-invio.
- `docs/DC.cs`: modello payload JSON, enum/codifiche e serializzazione decimali.
- `docs/Send.cs`: sequenza di autenticazione/sessione e invio POST all'endpoint documenti.
- `docs/Esiti.cs`: shape della risposta AdE mappata lato client.
- `docs/scontrinorapidoapiswagger.json`: OpenAPI 3.0.1 di un'API wrapper esterna (`Scontrino Rapido API`) utile come benchmark per endpoint e shape minime di integrazione.

Endpoint finale di invio confermato:

- `POST https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/` (nel codice viene aggiunto `?v=<unix_ms>`)
- `Content-Type: application/json`

Endpoint osservati lato ricerca/consultazione (nuovo `docs/ricerca.har`):

- `GET /ser/api/documenti/v1/doc/documenti/?...` (lista/paginazione/filtri)
- `GET /ser/api/documenti/v1/doc/documenti/{idtrx}/` (dettaglio documento)
- filtri rilevati: `tipoOperazione=V|A|R`, `numeroProgressivo`, range date (`dataDal`, `dataInvioAl`).

Endpoint osservati lato rubrica prodotti (nuovi `docs/rubrica_prodotti.har` + `docs/modifica_cancellazione.har`):

- `GET /ser/api/documenti/v1/doc/rubrica/prodotti` (lista prodotti)
- `POST /ser/api/documenti/v1/doc/rubrica/prodotti` (creazione, supporta array di prodotti)
- `PUT /ser/api/documenti/v1/doc/rubrica/prodotti` (modifica singolo prodotto)
- `DELETE /ser/api/documenti/v1/doc/rubrica/prodotti/{id}` (cancellazione prodotto)

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

### 2.1 Gestione sessione osservata nei tracciati CIE (nuovo)

Dai file `login_cie_redacted.har` e `logout_redacted.har` emergono pattern utili per la parte "provider AdE" senza introdurre dati sensibili:

1. **Login federato CIE con redirect SAML multi-dominio**
   - avvio su `ivaservizi.agenziaentrate.gov.it/dp/SPID/cie/s4`;
   - redirect verso `idserver.servizicie.interno.gov.it` con step `SAML2/POST/SSO` e challenge CIE;
   - ritorno su `https://ivaservizi.agenziaentrate.gov.it/dp/SPID` e poi `302` su `/portale/`.

2. **Bootstrap sessione applicativa dopo il ritorno sul portale**
   - subito dopo il landing su `/portale/web/guest/home` compare una chiamata a `/dp/api?v=<timestamp>`;
   - una chiamata iniziale a `/ser/api/fatture/v1/ul/me/adesione/stato/` risulta `401`;
   - quindi viene invocato il portlet Liferay `POST /portale/home?...DatiOpzioni...` (AJAX form-urlencoded) che sembra completare il contesto utente;
   - dopo questo passaggio la stessa `GET /ser/api/fatture/v1/ul/me/adesione/stato/` torna `200` JSON.

3. **Implicazione pratica per le API documento commerciale**
   - non basta "essere autenticati CIE": serve anche **sessione portale inizializzata** (contesto utenza/opzioni) prima di usare endpoint `/ser/api/documenti/...`;
   - il provider deve considerare la sessione pronta solo dopo almeno un check applicativo con risposta `200` (es. endpoint stato/utente, non solo redirect completato);
   - se endpoint applicativi rispondono `401/302` va rilanciata la pipeline di bootstrap (non solo il login IdP).

4. **Logout strutturato in più step**
   - sequenza osservata: chiamate `GET` a endpoint `.../cons/*/logout`, poi `GET /portale/c/portal/logout` (`302` -> `/dp/logout` -> `/portale/logout`);
   - per evitare sessioni appese, nel provider conviene eseguire logout esplicito (best effort) a fine batch/lavorazione lunga.

5. **Strategia consigliata lato adapter/provider**
   - mantenere un cookie-jar per tenant/utenza in memoria con TTL breve e lock per evitare login concorrenti;
   - implementare `ensureSession()` a stati: `NOT_AUTHENTICATED` -> `IDP_AUTHENTICATED` -> `PORTAL_BOOTSTRAPPED` -> `READY`;
   - usare health-check leggero (`/ser/api/...` che deve tornare `200`) prima dell'invio documento;
   - su `401` durante invio: un retry singolo con re-bootstrap completo e nuovo tentativo idempotente;
   - non serializzare mai cookie/token nei log applicativi.

### 2.2 Stato copertura end-to-end (login -> vendita -> annullo -> logout)

Valutazione sintetica rispetto all'obiettivo ScontrinoZero (mantenere sessione attiva ed emulare il comportamento portale):

- **Login CIE**: coperto a livello di sequenza HTTP/redirect ad alto livello (SAML + ritorno a `/portale/`).
- **Bootstrap sessione portale**: **parzialmente coperto**; dai HAR si vede il pattern `401` iniziale e successivo `200` dopo chiamata portlet `DatiOpzioni`, ma non abbiamo ancora una specifica completa/minimale dei parametri necessari in tutti i casi utente/utenza.
- **Creazione documento commerciale**: coperta lato payload business (`/ser/api/documenti/v1/doc/documenti/`) grazie ai tracciati vendita + modelli C#.
- **Annullamento documento commerciale**: coperto lato payload (`idtrx` root + `resoAnnullo` + riferimenti riga).
- **Logout**: coperto a livello sequenza (`cons/*/logout` + `portal/logout` + `dp/logout`).

Conclusione pratica: **siamo vicini a un flow completo, ma manca ancora qualche informazione operativa sulla sessione applicativa** per renderlo robusto in automazione server-to-server.

#### Gap informativi da chiudere prima della messa in produzione

1. **Handshake minimo per sessione READY**
   - Servono evidenze ripetute su quali chiamate sono _strettamente necessarie_ dopo il login CIE (es. `/dp/api`, `DatiOpzioni`, eventuale scelta utenza/P.IVA incaricato) per ottenere accesso stabile a `/ser/api/documenti/...`.

2. **Selezione utenza operativa (incaricato/intermediario)**
   - Dai file correnti non è completamente esplicitata la sequenza quando esistono più profili o più P.IVA selezionabili; questa parte può cambiare i permessi sugli endpoint documenti.

3. **Segnali di scadenza sessione e rinnovo**
   - Abbiamo pattern `401`, ma non ancora una mappa completa di tutti i codici/comportamenti (`302` a login, eventuali `403`, body applicativi) per implementare retry/riautenticazione deterministica.

4. **CSRF/header applicativi richiesti**
   - Nei HAR redatti alcuni dettagli sono oscurati: serve confermare se endpoint specifici richiedono token/header anti-CSRF oltre ai cookie di sessione in scenari reali.

5. **Download PDF/JSON post-invio nel medesimo contesto sessione**
   - Utile verificare con tracce dedicate se il recupero PDF/JSON documento richiede ulteriori step di bootstrap o riuso puro della sessione già pronta.

#### Piano minimo consigliato (per validare il flow completo)

- Registrare un HAR end-to-end unico: **login CIE -> scelta utenza (se presente) -> invio vendita -> annullo della stessa -> download PDF/JSON -> logout**.
- Marcare nel HAR i checkpoint: `SESSION_READY`, `SALE_SENT`, `VOID_SENT`, `LOGOUT_DONE`.
- Derivare da quel tracciato una macchina a stati provider definitiva (`READY`/`EXPIRED`/`REAUTH_REQUIRED`) con criteri di transizione testabili.

Con queste integrazioni, l'implementazione ScontrinoZero può emulare in modo affidabile il comportamento del portale AdE mantenendo una sessione applicativa viva e riutilizzabile.

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

## 3.3 Rubrica prodotti (nuovo)

### Endpoint

- `GET /api/v1/product-catalog`
- `POST /api/v1/product-catalog`
- `PUT /api/v1/product-catalog/{productId}`
- `DELETE /api/v1/product-catalog/{productId}`

### Note dal tracciato HAR

- La creazione su AdE accetta anche un array di prodotti nello stesso payload (`POST` con body `[{...},{...}]`).
- In fase di creazione i prodotti usano `id: 0`; dopo il salvataggio AdE assegna `id` numerico (es. `438166`, `438167`).
- In risposta lista (`GET`) `prezzoLordo`/`prezzoUnitario` tornano con scala ridotta (`"123.45"` vs `"123.45000000"` in input).
- `DELETE` è effettuato sull'id risorsa (`/rubrica/prodotti/{id}`) senza body.

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
- `document.customerTaxCode` -> `cfCessionarioCommittente` (se supportato dal tracciato corrente; dai sample può comparire anche con lunghezza diversa da 16).
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

## 5) Codifiche IVA/Natura: evidenze da HAR + C# + HTML menu

Evidenze concrete nei tracciati HAR aggiornati:

- in `docs/vendita_nuova_lotteria.har` e `docs/annullo_nuovo.har` le righe usano `aliquotaIVA: "22"` (IVA ordinaria) e `defAliquotaIVA: "N4"` nei dati fiscali esercente;
- in `docs/ricerca.har` (dettaglio di un documento precedente) compare `aliquotaIVA: "N2"` sulla riga prodotto;
- in `docs/rubrica_prodotti.har` compaiono creazioni con `aliquotaIVA: "10"` e `aliquotaIVA: "N2"`;
- in `docs/modifica_cancellazione.har` l'update mantiene `aliquotaIVA: "10"`.

Evidenze da HTML reale select (`docs/aliquote_iva.md`):

- pattern validazione front-end: `^(N1|N2|N3|N4|N5|N6|4|5|10|22|2|6\.4|7|7\.3|7\.5|7\.65|7\.95|8\.3|8\.5|8\.8|9\.5|12\.3)$`;
- nature con label:
  - `N1`: Escluse ex art. 15
  - `N2`: Non soggette
  - `N3`: Non imponibili
  - `N4`: Esenti
  - `N5`: Regime del margine
  - `N6`: Altro non IVA
- aliquote ordinarie/rese disponibili in select: `4`, `5`, `10`, `22`;
- percentuali compensazione agricoltura presenti in select: `2`, `6.4`, `7`, `7.3`, `7.5`, `7.65`, `7.95`, `8.3`, `8.5`, `8.8`, `9.5`, `12.3`.

Evidenze da modello C# (`docs/DC.cs`):

- enum/whitelist previsti: IVA ordinaria `4`, `5`, `10`, `22` e natura `N1`..`N7`.

Conclusione operativa sul mapping IVA:

- per il mapping tecnico API/adapter conviene allineare la validazione alle opzioni effettive della UI AdE (`N1..N6`, `4`, `5`, `10`, `22` + percentuali agricoltura), mantenendo retrocompatibilità in lettura per eventuali codici storici;
- `N7` resta possibile dal modello C# ma **non è presente** nel menu HTML acquisito: trattarlo come caso da verificare prima di abilitarlo in input lato API pubblica.

---

## 6) Validazioni consigliate (nostre API)

- `issuer.vatNumber`: 11 cifre.
- `issuer.taxCode`: accettare sia 16 caratteri alfanumerici (CF persona fisica) sia 11 cifre numeriche (casi presenti negli esempi esterni).
- `document.lines` obbligatorio e non vuoto per vendita.
- `document.payments` obbligatorio per vendita e vietato per annullo.
- Somma pagamenti = totale documento (tolleranza 0.01).
- `idempotencyKey` obbligatorio per endpoint POST.
- `originalDocument.transactionId` e `originalDocument.documentProgressive` obbligatori per annullo.
- `originalDocument.lineReferences[].adeLineId` obbligatorio se si annulla a livello riga.
- Data input in ISO (`yyyy-MM-dd`), conversione a `dd/MM/yyyy` solo nell'adapter AdE.
- Importi normalizzati prima dell'invio AdE in formato stringa a due decimali.
- Per endpoint rubrica prodotti: validare `descrizioneProdotto`, `prezzoLordo`, `prezzoUnitario`, `aliquotaIVA`; in creazione supportare array non vuoto.

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

---

## 11) Dettagli utili emersi dallo Swagger esterno (`scontrinorapidoapiswagger.json`)

Lo swagger analizzato espone 4 endpoint:

- `GET /api/DC/GetJsonDC` (download JSON per `idtrx`);
- `GET /api/DC/GetPdfDC` (download PDF per `idtrx`);
- `POST /api/DC/SendDCs` (invio array di documenti);
- `POST /api/DC/SendAnnullo` (annullo per `idtrx` + `ProgressivoTrasmissione`).

Indicazioni pratiche da recepire nella nostra specifica:

1. **Esporre endpoint di recupero JSON e PDF oltre all'invio**
   - Ad oggi la proposta copre invio (`sales`/`voids`) e rubrica.
   - Dallo swagger emerge valore operativo in endpoint di retrieval post-invio (JSON tecnico e PDF fiscale).
   - Proposta ScontrinoZero:
     - `GET /api/v1/commercial-documents/{transactionId}` (dettaglio normalizzato + raw opzionale)
     - `GET /api/v1/commercial-documents/{transactionId}/pdf` (stream PDF)

2. **Supportare batch in modo esplicito ma opzionale**
   - `SendDCs` accetta direttamente un array di `RootObject`.
   - Coerentemente con il nostro punto 10, manteniamo endpoint pubblici single-document come default, ma è utile prevedere una variante batch:
     - `POST /api/v1/commercial-documents/sales:batch`.
   - Vincoli suggeriti: limite massimo elementi, risposta per-item (`accepted`/`rejected`), idempotenza per singolo elemento.

3. **Separare bene autenticazione pubblica da credenziali AdE operative**
   - Nello swagger esterno compaiono parametri query (`usr`, `pwd`, `pin`, `tipoincarico`, `sceltapiva`) e header `token`/`piva`.
   - Per evitare coupling e leakage di segreti, nella nostra API questi dati **non devono** transitare per richiesta client: devono vivere nel provider AdE/tenant configuration lato server.

4. **Confermare shape di risposta tecnica compatibile con i tracciati C#**
   - Anche lo swagger usa una risposta con campi `esito`, `idtrx`, `progressivo`, `errori[]`, in linea con `docs/Esiti.cs`.
   - Questo rafforza la scelta del nostro `Error model unico` (sez. 7) con mapping stabile da risposta AdE raw a risposta pubblica normalizzata.

5. **Disallineamento numeri vs stringhe: fissare regola interna unica**
   - Nello swagger molti importi sono tipizzati come `number`.
   - Nei tracciati HAR/C# operativi gli importi vengono serializzati spesso come stringhe decimali a 2 cifre.
   - Per robustezza conviene mantenere la nostra regola adapter: input pubblico `number`, output AdE normalizzato con `toAdeAmount`.

### 11.1 Aggiornamento consigliato degli endpoint pubblici (v2 proposta)

Oltre a quanto già definito in sezione 3:

- `GET /api/v1/commercial-documents/{transactionId}`
  - recupera stato, progressivo, esito, errori e payload tecnico normalizzato;
- `GET /api/v1/commercial-documents/{transactionId}/pdf`
  - recupera il PDF fiscale generato da AdE;
- `POST /api/v1/commercial-documents/sales:batch` (opzionale)
  - invio multiplo controllato con risultato per elemento.

Questi endpoint coprono gli stessi casi d'uso osservati nello swagger esterno, mantenendo però un contratto più pulito e orientato al dominio ScontrinoZero.
