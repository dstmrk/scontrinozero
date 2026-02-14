# AdE Integration Analysis — Checkpoint

## Flusso autenticazione Fisconline (da Send.cs + login_fol.har)

### 6 fasi sequenziali

| Fase | Metodo | URL                                                                                                                                                                                                                                                                                                                      | Scopo                                       |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1    | GET    | `https://ivaservizi.agenziaentrate.gov.it/portale/web/guest`                                                                                                                                                                                                                                                             | Inizializza cookie jar (ottieni JSESSIONID) |
| 2    | POST   | `https://ivaservizi.agenziaentrate.gov.it/portale/home?p_p_id=58&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_pos=3&p_p_col_count=4&_58_struts_action=%2Flogin%2Flogin`                                                                                                                    | Login Fisconline                            |
| 3    | GET    | `https://ivaservizi.agenziaentrate.gov.it/dp/api?v={unix_ms}`                                                                                                                                                                                                                                                            | Bootstrap sessione portale                  |
| 4    | POST   | `https://ivaservizi.agenziaentrate.gov.it/portale/scelta-utenza-lavoro?p_auth={token}&p_p_id=SceltaUtenzaLavoro_WAR_SceltaUtenzaLavoroportlet&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_count=1&_SceltaUtenzaLavoro_WAR_SceltaUtenzaLavoroportlet_javax.portlet.action=incarichiAction` | Seleziona P.IVA operativa                   |
| 5    | GET    | `https://ivaservizi.agenziaentrate.gov.it/ser/api/fatture/v1/ul/me/adesione/stato/`                                                                                                                                                                                                                                      | Verifica sessione READY                     |
| 6    | POST   | `https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/?v={unix_ms}`                                                                                                                                                                                                                               | Invio documento                             |

### Credenziali login (Fase 2)

- Content-Type: `application/x-www-form-urlencoded`
- Campi: `_58_login` (codice fiscale), `_58_password`, `_58_pin`
- Opzionali: `_58_saveLastPath`, `_58_redirect`, `_58_doActionAfterLogin`, `ricorda-cf`

### Token p_auth (Liferay)

- Estratto dalla risposta HTML dopo login: `Liferay.authToken = '{p_auth}';`
- Necessario per la scelta utenza (Fase 4)

### Selezione utenza (Fase 4)

- Content-Type: `application/x-www-form-urlencoded`
- Campi: `sceltaincarico` (P.IVA), `tipoincaricante` (tipo incarico)

### Verifica login riuscito vs fallito (da auth_failed.har + documento-commerciale-api-json.md)

- Successo: POST login -> 302 Location `/portale/c` -> landing con `isSignedIn = "true"`
- Fallimento: POST login -> 302 Location `/portale/home?p_p_id=58...` -> `isSignedIn = "false"` + messaggio `Autenticazione fallita`
- ATTENZIONE: status 302 in entrambi i casi! Verificare il Location header o `isSignedIn`

### Cookie di sessione

- Cookie-jar based (JSESSIONID + eventuali cookie Liferay/OpenAM)
- Cookie strippati dai HAR export ma confermati dal C# (CookieContainer condiviso)

---

## API Endpoints completi (da HAR + C# + Swagger)

### Documenti commerciali

| Metodo | Endpoint                                                            | Scopo                     |
| ------ | ------------------------------------------------------------------- | ------------------------- |
| POST   | `/ser/api/documenti/v1/doc/documenti/`                              | Emissione vendita/annullo |
| GET    | `/ser/api/documenti/v1/doc/documenti/`                              | Ricerca con filtri        |
| GET    | `/ser/api/documenti/v1/doc/documenti/{idtrx}/`                      | Dettaglio documento       |
| GET    | `/ser/api/documenti/v1/doc/documenti/{idtrx}/stampa/?regalo={bool}` | Download PDF              |
| GET    | `/ser/api/documenti/v1/doc/documenti/ultimo/`                       | Ultimo documento          |
| GET    | `/ser/api/documenti/v1/doc/documenti/dati/fiscali`                  | Dati fiscali esercente    |

### Filtri ricerca

- `tipoOperazione=V|A|R`
- `dataDal=dd/MM/yyyy`
- `dataInvioAl=dd/MM/yyyy`
- `numeroProgressivo=DCW...`

### Rubrica prodotti

| Metodo | Endpoint                                          | Scopo                     |
| ------ | ------------------------------------------------- | ------------------------- |
| GET    | `/ser/api/documenti/v1/doc/rubrica/prodotti`      | Lista prodotti            |
| POST   | `/ser/api/documenti/v1/doc/rubrica/prodotti`      | Creazione (accetta array) |
| PUT    | `/ser/api/documenti/v1/doc/rubrica/prodotti`      | Modifica                  |
| DELETE | `/ser/api/documenti/v1/doc/rubrica/prodotti/{id}` | Cancellazione             |

### Info utente e sessione

| Metodo | Endpoint                                    | Scopo                        |
| ------ | ------------------------------------------- | ---------------------------- |
| GET    | `/common/testata/v1/info/me`                | Info utente autenticato      |
| GET    | `/ser/api/fatture/v1/ul/me/adesione/stato/` | Stato adesione (ready probe) |
| GET    | `/ser/api/messaggistica/v1/ul/me/totale`    | Notifiche                    |
| GET    | `/dp/api`                                   | Bootstrap sessione           |

### Logout

- `GET /cons/opt-services/logout`
- `GET /cons/cons-services/logout`
- `GET /cons/cons-other-services/logout`
- `GET /cons/mass-services/logout`
- `GET /portale/c/portal/logout` -> redirect -> `/dp/logout` -> `/portale/logout`

---

## Payload vendita (POST documenti/)

```json
{
  "datiTrasmissione": { "formato": "DCW10" },
  "cedentePrestatore": {
    "identificativiFiscali": {
      "codicePaese": "IT",
      "partitaIva": "XXXXXXXXXXX",
      "codiceFiscale": "XXXXXXXXXXXXXXXX"
    },
    "altriDatiIdentificativi": {
      "denominazione": "",
      "nome": "...",
      "cognome": "...",
      "indirizzo": "...",
      "numeroCivico": "...",
      "cap": "XXXXX",
      "comune": "...",
      "provincia": "XX",
      "nazione": "IT",
      "modificati": false,
      "defAliquotaIVA": "N4",
      "nuovoUtente": false
    },
    "multiAttivita": [],
    "multiSede": []
  },
  "documentoCommerciale": {
    "cfCessionarioCommittente": "",
    "flagDocCommPerRegalo": false,
    "progressivoCollegato": "",
    "dataOra": "dd/MM/yyyy",
    "multiAttivita": { "codiceAttivita": "", "descAttivita": "" },
    "importoTotaleIva": "0.00",
    "scontoTotale": "0.01",
    "scontoTotaleLordo": "0.01",
    "totaleImponibile": "2.01",
    "ammontareComplessivo": "2.00",
    "totaleNonRiscosso": "0.00",
    "elementiContabili": [
      {
        "idElementoContabile": "",
        "resiPregressi": "0.00",
        "reso": "0.00",
        "quantita": "1.00",
        "descrizioneProdotto": "prod",
        "prezzoLordo": "2.01",
        "prezzoUnitario": "2.01",
        "scontoUnitario": "0.01",
        "scontoLordo": "0.01",
        "aliquotaIVA": "N2",
        "importoIVA": "0.00",
        "imponibile": "2.01",
        "imponibileNetto": "2.00",
        "totale": "2.00",
        "omaggio": "N"
      }
    ],
    "vendita": [
      { "tipo": "PC", "importo": "1.00" },
      { "tipo": "PE", "importo": "1.00" },
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

## Payload annullo (POST documenti/)

Differenze dal vendita:

- Aggiunge `"idtrx": "{original_idtrx}"` a livello root
- Aggiunge `"resoAnnullo": { "tipologia": "A", "dataOra": "dd/MM/yyyy", "progressivo": "DCW..." }` in `documentoCommerciale`
- Aggiunge `"numeroProgressivo": "DCW..."` in `documentoCommerciale`
- NON include `vendita[]`
- `elementiContabili[].idElementoContabile` valorizzato con id riga originale

## Risposta AdE

```json
{
  "esito": true,
  "idtrx": "151085589",
  "progressivo": "DCW2026/5111-2188",
  "errori": []
}
```

## Headers richiesti per POST documenti

```
Accept: application/json, text/plain, */*
Content-Type: application/json;charset=UTF-8
Origin: https://ivaservizi.agenziaentrate.gov.it
User-Agent: Mozilla/5.0 (Windows NT 6.1; ...) Chrome/72.0... Safari/537.36
X-Content-Type-Options: nosniff
X-Frame-Options: deny
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=16070400; includeSubDomains
```

## Codifiche IVA (da aliquote_iva.md + C#)

Aliquote ordinarie: `4`, `5`, `10`, `22`
Nature (esente/escluso): `N1` (escluse art.15), `N2` (non soggette), `N3` (non imponibili), `N4` (esenti), `N5` (regime margine), `N6` (altro non IVA), `N7` (presente in C#, assente da UI)
Compensazione agricoltura: `2`, `6.4`, `7`, `7.3`, `7.5`, `7.65`, `7.95`, `8.3`, `8.5`, `8.8`, `9.5`, `12.3`

Pattern validazione frontend: `^(N1|N2|N3|N4|N5|N6|4|5|10|22|2|6\.4|7|7\.3|7\.5|7\.65|7\.95|8\.3|8\.5|8\.8|9\.5|12\.3)$`

## Tipi pagamento

- `PC` = Contanti
- `PE` = Pagamento Elettronico
- `TR` = Ticket Restaurant (con campo `numero`)
- `NR_EF` = Non Riscosso - Emissione Fattura
- `NR_PS` = Non Riscosso - Prestazioni Servizi
- `NR_CS` = Non Riscosso - Credito cessione bene

## Tipi operazione

- `V` = Vendita
- `A` = Annullo (documenti generati online)
- `AX` = Annullo esterno (documenti da altri sistemi)
- `R` = Reso (documenti generati online)
- `RX` = Reso esterno (documenti da altri sistemi)

## Formattazione importi

- Tutti come stringhe con 2 decimali: `"1.00"`, `"2.01"`
- Separatore: `.` (dot)
- No separatore migliaia
- Nota: nel HAR vendita.har gli importi computati hanno 8 decimali (`"2.01000000"`) ma nel C# sono N2 (2 decimali)
- Approccio sicuro: usare 2 decimali come il C#

## Risposte alle domande del documento-commerciale-api-json.md

1. **Selezione utenza**: Il C# ha un passo esplicito (Fase 4) con `sceltaincarico` (P.IVA) e `tipoincaricante`
2. **Ricerca documento**: Supporta filtri `tipoOperazione=V|A|R`, range date, numero progressivo
3. **Annullamento**: Sempre relativo a un documento esistente tramite `idtrx` + `progressivo`
4. **Retrieval post-invio**: Endpoint JSON (`/documenti/{idtrx}/`) e PDF (`/documenti/{idtrx}/stampa/`)
5. **Logout**: Sequenza multi-step (cons/\*/logout + portal/logout + dp/logout)

## Conclusione

**Abbiamo copertura COMPLETA per il flusso: Login FOL -> Vendita -> Ricerca -> Annullo -> PDF -> Logout.**

Il materiale (HAR + C# + Swagger) fornisce tutte le informazioni necessarie per implementare l'adapter AdE in TypeScript. Non ci sono gap bloccanti.
