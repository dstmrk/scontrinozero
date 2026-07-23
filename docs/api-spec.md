# ScontrinoZero — Specifica integrazione AdE

Questo documento descrive l'**integrazione HTTP con l'Agenzia delle Entrate
(AdE)** per il Documento Commerciale Online (flussi di login, endpoint documenti,
payload, codifiche) e il **contratto adapter interno** (`src/lib/ade/`) che mappa
i DTO applicativi sul payload AdE.

> **Non è la documentazione dell'API REST pubblica per sviluppatori.** L'API HTTP
> esposta agli integratori (`POST /api/v1/receipts`, `GET /api/v1/receipts`,
> `GET /api/v1/receipts/{id}`, `POST /api/v1/receipts/{id}/void`) è documentata
> nella pagina pubblica **`/help/api`** (`src/app/(marketing)/help/api/page.tsx`)
> e nel prodotto/architettura in **`DEVELOPER.md`**. I nomi campo del corpo HTTP
> pubblico (`grossUnitPrice`, `paymentMethod`) **differiscono** da quelli del DTO
> adapter interno descritto qui (`unitPriceGross`, `payments[]`).

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

## 1A. Autenticazione AdE (CIE — Carta d'Identità Elettronica)

> **Stato**: implementato e **live** (PR #695, HAR
> `login_cie_ok_notifica_app.har`). Il login CIE usato dall'app **non** richiede
> la carta fisica né la scansione di un QR code: è il **"livello 2"** dell'app
> **CIE ID** — email + password dell'app CIE ID sull'IdP Shibboleth del Ministero
> dell'Interno, con conferma via **notifica push** sul telefono. È automatizzabile
> con sole chiamate HTTP (nessuna sessione browser). Implementazione: `cieLogin`
> in `src/lib/ade/real-client.ts`, fasi `CIE-1…CIE-8`.

Base URL AdE SP: `https://sp.agenziaentrate.gov.it`
IdP CIE (Shibboleth Min. Interno): `https://idserver.servizicie.interno.gov.it`

### 1A.1 Flusso CIE livello 2 (da `login_cie_ok_notifica_app.har`)

| Fase  | Metodo | URL / Dominio                                                             | Scopo                                                                                       |
| ----- | ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| CIE-1 | GET    | `sp.agenziaentrate.gov.it/rp/cie/sel?RelayState=FATBTB`                   | Entry AdE SP → HTML con form auto-submit contenente la SAMLRequest verso l'IdP              |
| CIE-2 | POST   | `idserver…/idp/profile/SAML2/POST/SSO`                                    | SAMLRequest all'IdP → 302 → pagina probe `localStorage` Shibboleth (e1s1)                   |
| CIE-3 | POST   | `idserver…` (probe `localStorage`, e1s1)                                  | Segue i redirect fino alla pagina credenziali livello 2                                     |
| CIE-4 | POST   | `idserver…/idp/login/livello2`                                            | Credenziali: email CIE ID + password → pagina d'attesa push. KO → "Credenziali non valide." |
| CIE-5 | GET    | `idserver…/idp/login/livello1e2checkpush` (poll) → `…/livello1e2postpush` | Poll finché l'app CIE ID approva la push, poi `postpush` → segue i redirect                 |
| CIE-6 | POST   | `idserver…` consenso attributi (e1s4)                                     | 302 → pagina probe `localStorage` finale (e1s5)                                             |
| CIE-7 | POST   | `idserver…` (probe finale, e1s5)                                          | 200 → HTML con form auto-submit contenente la SAMLResponse verso l'AdE SP                   |
| CIE-8 | POST   | `sp.agenziaentrate.gov.it` (ACS) → make4SAM → `iampe` Consumer            | SAMLResponse → make4SAM → bootstrap `iampe` → portale home AdE                              |

### 1A.2 Caratteristiche chiave

- **SAML2**: protocollo SAML 2.0 (POST binding), IdP Shibboleth del Ministero dell'Interno
- **Entry point AdE SP**: `GET /rp/cie/sel?RelayState=FATBTB`
- **Autenticazione**: email + password dell'app **CIE ID** (livello 2) — **non** la carta fisica
- **Conferma**: **notifica push** sull'app CIE ID (poll `checkpush` → `postpush`), **nessun QR**
- **Bootstrap post-auth**: `make4SAM` → Consumer `iampe.agenziaentrate.gov.it` → portale home
- **Sessione**: nessuna credenziale ri-loggabile in silenzio (il 2° fattore è umano). Emit/void riusano la sessione interattiva dallo store; se assente/scaduta → `AdeReauthRequiredError`

> **Nota storica.** Il primo assessment (HAR `login_cie.har`, entry
> `/dp/SPID/cie/s4`) documentava la variante **"carta fisica"** livello 1/3 con
> scansione QR dell'app CIE ID, ritenuta non automatizzabile headlessly. Quella
> variante **non è usata** da ScontrinoZero: l'integrazione live usa il livello 2
> (email + password + push) descritto sopra.

---

## 1B. Autenticazione AdE (SPID — Sistema Pubblico di Identità Digitale)

> **Nota**: il flusso SPID richiede conferma via app del proprio Identity Provider
> (notifica push o QR). Non è automatizzabile headlessly. Documentato a fini di
> ricerca per eventuale implementazione futura.

Base URL: `https://ivaservizi.agenziaentrate.gov.it`
Chooser SPID: `https://spid.sogei.it/SPIDManagerWeb/loginFattureCorrispettivi.html`

### 1B.1 Flusso SPID (da `login_spid.har`, 170 richieste — IDP: Sielte)

| Fase | Metodo | URL / Dominio                                                 | Scopo                                               |
| ---- | ------ | ------------------------------------------------------------- | --------------------------------------------------- |
| 1    | GET    | `spid.sogei.it/SPIDManagerWeb/loginFattureCorrispettivi.html` | Pagina scelta IDP (12 provider disponibili)         |
| 2    | GET    | `ivaservizi…/dp/SPID/{provider}/s4`                           | Entry point SPID per l'IDP scelto → redirect a IDP  |
| 3    | POST   | `identity.sieltecloud.it/…/SSOService.php`                    | SAMLRequest all'IDP SPID scelto                     |
| 4    | POST   | `identity.sieltecloud.it/…/loginform.php`                     | Credenziali IDP: `username=CF&password=...`         |
| 5    | POST   | `…` (`usenotify=true`)                                        | Richiesta conferma via app                          |
| 6    | GET    | `…/NotifyPage.php`                                            | **Polling** (ripetuto finché non confermato da app) |
| 7    | POST   | `…/loginform.php` (`accedi=1`)                                | Conferma ricevuta → 303                             |
| 8    | POST   | `…/accept.php` (`accept=true`)                                | Accetta rilascio attributi                          |
| 9    | POST   | `ivaservizi…/dp/SPID`                                         | SAMLResponse → AdE → 302                            |
| 10   | GET    | `ivaservizi…/dp/api?v={unix_ms}`                              | Bootstrap sessione AdE (identico a Fisconline)      |
| 11   | GET    | `…/ser/api/fatture/v1/ul/me/adesione/stato/`                  | 401 → trigger DatiOpzioni                           |
| 12   | POST   | DatiOpzioni portlet                                           | Setup sessione                                      |
| 13   | GET    | `…/adesione/stato/`                                           | 200 → sessione pronta                               |

### 1B.2 Provider SPID disponibili

Dalla pagina chooser (`loginFattureCorrispettivi.html`) risultano 12 IDP:

| IDP            | Entry point AdE                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Aruba          | `/dp/SPID/aruba/s4`                                                                                                         |
| InfoCert       | `/dp/SPID/infocert/s4`                                                                                                      |
| Intesa (TIM)   | `/dp/SPID/intesa/s4`                                                                                                        |
| Namirial       | `/dp/SPID/namirial/s4`                                                                                                      |
| Poste Italiane | `/dp/SPID/poste/s4`                                                                                                         |
| Sielte         | `/dp/SPID/sielte/s4`                                                                                                        |
| SpidItalia     | `/dp/SPID/spiditalia/s4`                                                                                                    |
| Teamsystem     | `/dp/SPID/teamsystem/s4`                                                                                                    |
| Lepida         | `/dp/SPID/lepida/s4`                                                                                                        |
| Etna.com       | `/dp/SPID/etna/s4`                                                                                                          |
| CIE (via SPID) | `/dp/SPID/cie/s4` — variante storica "carta fisica" livello 1/3, non usata; l'integrazione live usa `/rp/cie/sel` (sez. 1A) |
| Altri          | pattern `/dp/SPID/{provider}/s4`                                                                                            |

### 1B.3 Caratteristiche chiave

- **SAML2**: Usa SAML 2.0 POST binding (identico a CIE ma IDP diverso per ogni provider)
- **Entry point AdE**: `GET /dp/SPID/{provider}/s4` — il provider è scelto dall'utente
- **Credenziali**: username = Codice Fiscale, password = password SPID del provider scelto
- **Conferma app**: polling `NotifyPage.php` finché l'utente approva la notifica push
- **Bootstrap post-auth**: identico al flusso Fisconline (Fasi 3-5 della sezione 1.1)
- **Logout**: identico alla sezione 1.6

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
| GET      | `/documenti/dati/fiscali`                                        | Leggi dati fiscali esercente      |
| **PUT**  | `/documenti/dati/fiscali?v={unix_ms}`                            | Aggiorna dati fiscali esercente   |

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

### 2.6 Dati fiscali esercente (GET + PUT)

Source: `dati_doc_commerciale.har`

Il payload restituito da `GET /documenti/dati/fiscali` è identico al body
richiesto da `PUT /documenti/dati/fiscali?v={unix_ms}` ed è lo stesso oggetto
`cedentePrestatore` presente nel payload dei documenti commerciali (sezione 3).

**Pattern di utilizzo (Phase 4H — onboarding refactor):**

1. Dopo la verifica credenziali AdE, chiamare `GET /documenti/dati/fiscali`
2. Il risultato contiene `partitaIva` e `codiceFiscale` → salvare in DB
3. Per aggiornare i dati dell'esercente su AdE: `PUT /documenti/dati/fiscali?v={unix_ms}`

#### Struttura payload (GET response = PUT body)

```json
{
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
    "comune": "Torino",
    "provincia": "TO",
    "nazione": "IT",
    "modificati": false,
    "defAliquotaIVA": "N2",
    "nuovoUtente": false
  },
  "multiAttivita": [],
  "multiSede": []
}
```

#### Campi `altriDatiIdentificativi`

| Campo            | Tipo    | Note                                                                        |
| ---------------- | ------- | --------------------------------------------------------------------------- |
| `denominazione`  | string  | Ragione sociale (vuoto per persone fisiche)                                 |
| `nome`           | string  | Nome (persone fisiche)                                                      |
| `cognome`        | string  | Cognome (persone fisiche)                                                   |
| `indirizzo`      | string  | Via / piazza (senza numero civico)                                          |
| `numeroCivico`   | string  | Numero civico separato dall'indirizzo                                       |
| `cap`            | string  | CAP (5 cifre per Italia)                                                    |
| `comune`         | string  | Città                                                                       |
| `provincia`      | string  | Sigla provincia (2 lettere)                                                 |
| `nazione`        | string  | Codice ISO paese (es. `"IT"`)                                               |
| `modificati`     | boolean | `false` in PUT normale; AdE potrebbe usarlo per ottimizzazioni              |
| `defAliquotaIVA` | string  | Aliquota IVA di default per l'esercente → mappa a `preferredVatCode` nel DB |
| `nuovoUtente`    | boolean | `false` per utenti esistenti                                                |

#### Risposta PUT

```json
{ "esito": true, "errori": [] }
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

## 8. Contratto adapter interno (DTO)

> ⚠️ **Questa NON è l'API HTTP pubblica** (vedi la nota in testa al documento e
> `/help/api`). Descrive i **DTO interni** definiti in
> `src/lib/ade/public-types.ts` che il service layer costruisce e passa al mapper
> AdE (sez. 9). I nomi campo qui (`unitPriceGross`, `payments[]`) sono quelli del
> DTO, **non** quelli del corpo HTTP pubblico (`grossUnitPrice`, `paymentMethod`).
> L'`idempotencyKey` e il `businessId` sono passati a parte al service, non dentro
> il DTO di vendita.

### 8.1 DTO vendita (`SaleDocumentRequest`)

Costruito da `emitReceiptForBusiness` (`src/lib/services/receipt-service.ts`) e
passato a `mapSaleToAdePayload`:

```json
{
  "date": "2026-02-15",
  "lotteryCode": null,
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
```

### 8.2 DTO annullo (`VoidRequest`)

Costruito da `voidReceiptForBusiness` (`src/lib/services/void-service.ts`) e
passato a `mapVoidToAdePayload`:

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

### 8.3 Esito

L'adapter normalizza la risposta AdE (`AdeResponse`, sez. 2.5) e il service
ritorna al chiamante un risultato tipizzato (`SubmitReceiptResult` /
`VoidReceiptResult`) con `documentId`/`voidDocumentId`, `adeTransactionId`,
`adeProgressive` — oppure `error` + `code` machine-readable. La forma HTTP finale
(status code, envelope `{ "error": "…" }`) è responsabilità delle route
`/api/v1/receipts/*` → vedi `/help/api` e `DEVELOPER.md`.

---

## 9. Mapping DTO adapter → payload AdE

> Nella colonna "DTO adapter" i nomi si riferiscono ai tipi interni di sez. 8
> (`public-types.ts`), non al corpo HTTP pubblico.

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

## 10. Validazioni

La validazione **autoritativa** del corpo HTTP pubblico vive in
`src/lib/receipts/receipt-schema.ts` (`saleBodySchema`, condiviso con la server
action `emitReceipt`). La tabella sotto riassume gli invarianti a livello DTO /
mapper AdE; per i nomi campo e i limiti esatti del corpo HTTP pubblico vedi
`/help/api`.

| Campo (DTO)                            | Regola                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| `idempotencyKey`                       | UUID v4 obbligatorio                                         |
| `date`                                 | ISO 8601 (`yyyy-MM-dd`)                                      |
| `lines`                                | Array non vuoto, max 100 righe (vendita)                     |
| `lines[].quantity`                     | > 0, ≤ 9999, max 3 decimali                                  |
| `lines[].unitPriceGross`               | ≥ 0, ≤ 999.999,99, max 2 decimali                            |
| `lines[].vatCode`                      | Solo `4`/`5`/`10`/`22`/`N1`–`N6` (sottoinsieme della sez. 6) |
| `lines[].description`                  | 1–200 caratteri (limite corpo HTTP)                          |
| `payments`                             | Un pagamento con `amount` = totale documento                 |
| `originalDocument.transactionId`       | Obbligatorio per annullo                                     |
| `originalDocument.documentProgressive` | Obbligatorio per annullo                                     |

---

## 11. Persistenza

### Tabella `commercial_documents`

| Colonna              | Tipo        | Note                                                                           |
| -------------------- | ----------- | ------------------------------------------------------------------------------ |
| `id`                 | uuid        | PK                                                                             |
| `business_id`        | uuid        | NOT NULL, FK → `businesses` (cascade)                                          |
| `kind`               | enum        | `SALE`, `VOID`                                                                 |
| `idempotency_key`    | uuid        | Unique **per business** (`business_id` + `idempotency_key`, migr. 0009)        |
| `public_request`     | jsonb       | Payload applicativo (`paymentMethod`, `lotteryCode`)                           |
| `request_hash`       | text        | SHA-256 canonico del SALE (rileva riuso key con payload diverso). NULL su VOID |
| `ade_response`       | jsonb       | Risposta AdE raw                                                               |
| `ade_transaction_id` | text        | `idtrx` AdE                                                                    |
| `ade_progressive`    | text        | `progressivo` AdE                                                              |
| `lottery_code`       | text        | Codice lotteria (solo SALE con pagamento `PE`)                                 |
| `api_key_id`         | uuid        | FK → `api_keys` (set null). NULL = emissione via UI dashboard                  |
| `voided_document_id` | uuid        | Solo VOID: self-FK al SALE annullato. Unique parziale (anti doppio-annullo)    |
| `status`             | enum        | `PENDING`, `ACCEPTED`, `VOID_ACCEPTED`, `REJECTED`, `ERROR`                    |
| `created_at`         | timestamptz |                                                                                |
| `updated_at`         | timestamptz |                                                                                |

### Tabella `commercial_document_lines`

| Colonna            | Tipo          | Note                                  |
| ------------------ | ------------- | ------------------------------------- |
| `id`               | uuid          | PK                                    |
| `document_id`      | uuid          | FK → `commercial_documents` (cascade) |
| `line_index`       | int           | Ordine riga                           |
| `description`      | text          | ≤ 200 caratteri (CHECK, migr. 0019)   |
| `quantity`         | numeric(10,3) | ≥ 0 (CHECK)                           |
| `gross_unit_price` | numeric(10,2) | ≥ 0 (CHECK)                           |
| `vat_code`         | text          |                                       |

---

## 12. Architettura adapter

```
Route /api/v1/receipts o server action emitReceipt → Validazione (Zod, saleBodySchema)
  → Service layer (DTO SaleDocumentRequest / VoidRequest, sez. 8)
  → Mapper (mapSaleToAdePayload / mapVoidToAdePayload)
  → AdeClient (interfaccia)
    ├── RealAdeClient (HTTP verso AdE)
    └── MockAdeClient (simula risposta, stessa logica senza HTTP)
  → Persistenza (public_request + ade_response)
  → Risposta normalizzata al client
```

Il `RealAdeClient` gestisce internamente:

- Cookie jar per sessione
- Login Fisconline (6 fasi)
- Retry con re-auth su 401
- Logout a fine batch

Controllato da `ADE_MODE=real|mock` (variabile d'ambiente).
