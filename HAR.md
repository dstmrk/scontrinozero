# HAR.md — Registro dei finding estratti dai tracciati HAR del portale AdE

**Scopo.** I file `.har` sono catture locali del traffico del portale
_Documento Commerciale Online_: contengono cookie e dati di sessione reali,
sono **gitignorati** e **non esistono in un clone fresco** (CI, sessioni
cloud, altre macchine). Questo file è la loro traduzione permanente: tutto
ciò che serve per implementare deve stare **qui**, così nessun task futuro
deve chiedere di ri-catturare un HAR.

**Convenzione.** Ogni voce è numerata e autoconsistente: deve poter essere
usata leggendo solo la sua sezione. I numeri non si riusano mai — una voce
superata si marca `[SUPERATA da #N]` invece di essere rinumerata. Le voci
nuove si aggiungono in fondo alla sezione pertinente.

**Sfoltito il 27/08/2026.** Le voci il cui contenuto è ormai inchiodato da
codice e test — il piano dei sub-task (#14, tutti spediti) e le divergenze del
mapper (#11, chiuse) — sono state ridotte a un puntatore invece che
cancellate: **il codice cita queste voci in oltre cento punti**, e un numero
che sparisce lascia un commento che rimanda al nulla. Quello che resta è ciò
che il codice non sa dire da solo: com'è fatto il payload, perché i due sconti
sono grandezze fiscali diverse, e dove finisce l'evidenza misurata (#15).

**Rapporto con gli altri documenti.**

- `docs/api-spec.md` — specifica _normativa_ del payload AdE e del contratto
  adapter. Se una voce qui contraddice la spec, **la voce vince** (è misurata
  sul campo) e la spec va corretta nello stesso PR.
- `REVIEW.md` — bug noti e tech debt. Le divergenze fra questo registro e il
  codice attuale che vanno _fixate_ hanno una voce lì.
- Skill `ade-integration` — come si lavora sull'integrazione (procedure).
  Questo file è _cosa_ ha risposto l'AdE (dati).

**Dati mascherati.** P.IVA e codice fiscale del cedente sono sostituiti con
`XXXXXXXXXXX` / `XXXXXXXXXXXXXXXX`: questo file è versionato.

---

## Indice

| #   | Voce                                                              |
| --- | ----------------------------------------------------------------- |
| 1   | Caso di riferimento: vendita con sconto di riga e pagamento misto |
| 2   | Anatomia della riga contabile — le formule vere                   |
| 3   | I due sconti sono grandezze fiscali diverse                       |
| 4   | Totali di documento                                               |
| 5   | Quadratura dei pagamenti                                          |
| 6   | Codici pagamento: `PC`, `PE`, `TR`, `NR_EF`, `NR_PS`, `NR_CS`     |
| 7   | Righe omaggio: escluse da `ammontareComplessivo`                  |
| 8   | Layout del PDF stampato dall'AdE                                  |
| 9   | Annullo di un documento con sconti e pagamento misto              |
| 10  | Gli 8 decimali sono precisione vera, non padding                  |
| 11  | Divergenze fra il nostro mapper e il portale                      |
| 12  | `prezzoLordo` è il prezzo **unitario** — confermato               |
| 13  | Lotteria degli scontrini: incompatibile col pagamento misto       |
| 14  | Guida all'implementazione (sub-task ordinati)                     |
| 15  | Cosa NON è stato misurato (limiti noti di questo registro)        |
| 16  | Ricevuta di annullamento: dati, stampa e timestamp                |
| 17  | Layout ufficiale AdE: dove vanno i due sconti sul documento       |

---

## 1. Caso di riferimento: vendita con sconto di riga e pagamento misto

**Fonte:** `sconto_e_pagamento_misto.har`, cattura del 18/08/2026 sul portale
reale (7 entry; l'unica che conta è la `POST` a
`/ser/api/documenti/v1/doc/documenti/`).

**Scenario impostato a mano nel wizard AdE:**

| Elemento        | Valore                                                    |
| --------------- | --------------------------------------------------------- |
| Riga 1          | "Prova senza sconto", qta 1, 1,00 €, natura `N2`          |
| Riga 2          | "Prova con sconto", qta 1, 1,00 €, IVA 10%, sconto 0,10 € |
| Pagamento       | Contante 0,50 € + Elettronico 1,00 €                      |
| Sconto a pagare | 0,40 €                                                    |

**Payload inviato (verbatim, valori identificativi mascherati):**

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
      "denominazione": "Test",
      "indirizzo": "Corso S",
      "numeroCivico": "22",
      "cap": "10126",
      "comune": "",
      "provincia": "",
      "nazione": "IT",
      "modificati": true,
      "defAliquotaIVA": "",
      "nuovoUtente": false
    },
    "multiAttivita": [],
    "multiSede": []
  },
  "documentoCommerciale": {
    "cfCessionarioCommittente": "",
    "flagDocCommPerRegalo": false,
    "progressivoCollegato": "",
    "dataOra": "18/08/2026",
    "multiAttivita": { "codiceAttivita": "", "descAttivita": "" },
    "importoTotaleIva": "0.08181818",
    "scontoTotale": "0.09090909",
    "scontoTotaleLordo": "0.10000000",
    "totaleImponibile": "1.90909091",
    "ammontareComplessivo": "1.90000000",
    "totaleNonRiscosso": "0.00000000",
    "elementiContabili": [
      {
        "idElementoContabile": "",
        "resiPregressi": "0.00",
        "reso": "0.00",
        "quantita": "1.00",
        "descrizioneProdotto": "Prova senza sconto",
        "prezzoLordo": "1.00000000",
        "prezzoUnitario": "1.00000000",
        "scontoUnitario": "0.00000000",
        "scontoLordo": "0.00000000",
        "aliquotaIVA": "N2",
        "importoIVA": "0.00000000",
        "imponibile": "1.00000000",
        "imponibileNetto": "1.00000000",
        "totale": "1.00000000",
        "omaggio": "N"
      },
      {
        "idElementoContabile": "",
        "resiPregressi": "0.00",
        "reso": "0.00",
        "quantita": "1.00",
        "descrizioneProdotto": "Prova con sconto",
        "prezzoLordo": "1.00000000",
        "prezzoUnitario": "0.90909091",
        "scontoUnitario": "0.09090909",
        "scontoLordo": "0.10000000",
        "aliquotaIVA": "10",
        "importoIVA": "0.08181818",
        "imponibile": "0.90909091",
        "imponibileNetto": "0.81818182",
        "totale": "0.90000000",
        "omaggio": "N"
      }
    ],
    "vendita": [
      { "tipo": "PC", "importo": "0.50" },
      { "tipo": "PE", "importo": "1.00" },
      { "tipo": "TR", "importo": "0.00", "numero": "0" },
      { "tipo": "NR_EF", "importo": "0.00" },
      { "tipo": "NR_PS", "importo": "0.00" },
      { "tipo": "NR_CS", "importo": "0.00" }
    ],
    "scontoAbbuono": "0.40",
    "importoDetraibileDeducibile": "0.00000000"
  },
  "flagIdentificativiModificati": false
}
```

**Risposta AdE (HTTP 200):**

```json
{
  "esito": true,
  "idtrx": "226076907",
  "progressivo": "DCW2026/2610-5298",
  "errori": []
}
```

Il documento è stato **accettato**: tutti i valori qui sopra sono una
combinazione valida secondo l'AdE, e vanno usati come oracolo nei test.

---

## 2. Anatomia della riga contabile — le formule vere

I nomi dei campi AdE sono fuorvianti. `scontoUnitario` **non** è "sconto per
unità" e `prezzoUnitario` **non** è "prezzo lordo per unità": il suffisso
_-Unitario_ qui significa **imponibile**, cioè il valore **al netto
dell'IVA**. Lo dimostra la riga 2 della voce #1: con aliquota 10%,

- `prezzoUnitario` = `0.90909091` = `1.00 / 1.1`
- `scontoUnitario` = `0.09090909` = `0.10 / 1.1`

Sulla riga 1 (natura `N2`, IVA zero) i due valori coincidono col lordo, che è
esattamente perché la cosa era rimasta invisibile finora: **tutti** gli HAR
precedenti erano su nature `N*`.

Detto `r` = aliquota in percentuale (0 per le nature `N1`–`N6`) e
`d = 1 + r/100`:

| Campo             | Formula                                          |
| ----------------- | ------------------------------------------------ |
| `prezzoLordo`     | prezzo **unitario** lordo (confermato, voce #12) |
| `prezzoUnitario`  | `prezzoLordo / d`                                |
| `scontoLordo`     | sconto **della riga**, lordo (già × quantità)    |
| `scontoUnitario`  | `scontoLordo / d`                                |
| `imponibile`      | `prezzoUnitario × quantita`                      |
| `imponibileNetto` | `imponibile − scontoUnitario`                    |
| `importoIVA`      | `imponibileNetto × r / 100`                      |
| `totale`          | `imponibileNetto + importoIVA`                   |

Identità equivalente e più comoda per il codice, perché lavora sui lordi (che
restano cent-esatti, regola 17):

```
totale = prezzoLordo × quantita − scontoLordo
```

**Verifica numerica sulla riga 2 della voce #1** (`r = 10`, `d = 1.1`):

```
prezzoUnitario  = 1.00 / 1.1              = 0.90909091
scontoUnitario  = 0.10 / 1.1              = 0.09090909
imponibile      = 0.90909091 × 1          = 0.90909091
imponibileNetto = 0.90909091 − 0.09090909 = 0.81818182
importoIVA      = 0.81818182 × 0.10       = 0.08181818
totale          = 0.81818182 + 0.08181818 = 0.90000000
                = 1.00 × 1 − 0.10         = 0.90000000  ✓
```

**Nature `N1`–`N6`:** `r = 0`, quindi `d = 1`, quindi
`prezzoUnitario = prezzoLordo`, `scontoUnitario = scontoLordo`,
`importoIVA = 0`. Nessun ramo speciale serve nel codice: la formula generale
degenera già nel caso giusto.

**Campi costanti in vendita:** `idElementoContabile` = `""`,
`resiPregressi` = `"0.00"`, `reso` = `"0.00"`. `quantita` ha **2 decimali**
(`"1.00"`, `"2.00"`), non 8.

---

## 3. I due sconti sono grandezze fiscali diverse

Il portale AdE espone **due** sconti che non vanno confusi, perché hanno
effetti fiscali opposti.

### 3a. Sconto di riga (`scontoLordo` / `scontoUnitario`)

Applicato al singolo prodotto. **Riduce la base imponibile e quindi l'IVA
dovuta.** Nella voce #1 la riga al 10% con 0,10 € di sconto versa IVA su
0,81818182 € invece che su 0,90909091 €.

Entra in `scontoTotale` / `scontoTotaleLordo` e riduce
`ammontareComplessivo`.

### 3b. Sconto a pagare (`scontoAbbuono`, livello documento)

È il campo `documentoCommerciale.scontoAbbuono`, **2 decimali** (non 8).
Nel wizard AdE compare come una voce della schermata dei pagamenti, accanto a
contante ed elettronico — ed è per questo che si scambia facilmente per un
metodo di pagamento, ma **non lo è**: non sta nell'array `vendita[]`, sta a
livello di documento.

**Non tocca nulla del calcolo fiscale**: `totaleImponibile`,
`importoTotaleIva` e `ammontareComplessivo` restano quelli che sarebbero
senza. Nella voce #1 il corrispettivo resta 1,90 € e l'IVA si versa su 1,90 €,
ma il cliente sborsa 1,50 €. È un **abbuono concesso in fase di pagamento**:
l'esercente rinuncia a incassare una parte del corrispettivo, non riduce il
corrispettivo.

Serve a **chiudere la quadratura** quando l'incassato è inferiore al totale
(vedi voce #5): tipicamente l'arrotondamento in cassa o uno sconto "a occhio"
concesso al momento di pagare.

### Regola pratica per la UI

| L'esercente vuole…                                         | Campo           |
| ---------------------------------------------------------- | --------------- |
| …scontare un prodotto (e pagare meno IVA su quel prodotto) | sconto di riga  |
| …arrotondare/abbuonare il resto senza toccare l'IVA        | `scontoAbbuono` |

Presentarli con la stessa etichetta ("Sconto") farebbe scegliere all'esercente
un trattamento IVA sbagliato su un documento fiscale irreversibile.

---

## 4. Totali di documento

Tutti a **8 decimali** (eccetto `scontoAbbuono`, 2).

| Campo                  | Formula                                               |
| ---------------------- | ----------------------------------------------------- |
| `totaleImponibile`     | Σ `imponibile` di **tutte** le righe (omaggi inclusi) |
| `scontoTotale`         | Σ `scontoUnitario` (sconto **netto**)                 |
| `scontoTotaleLordo`    | Σ `scontoLordo` (sconto **lordo**)                    |
| `importoTotaleIva`     | Σ `importoIVA`                                        |
| `ammontareComplessivo` | Σ `totale` **escluse le righe omaggio** (voce #7)     |
| `totaleNonRiscosso`    | non verificato — vedi voce #6                         |

⚠️ `scontoTotale ≠ scontoTotaleLordo` appena c'è **uno sconto su una riga con
aliquota IVA**: nella voce #1 valgono rispettivamente `0.09090909` e
`0.10000000`. Coincidono solo quando tutte le righe scontate sono a natura
`N*`. Vedi voce #11 punto 1.

**Le etichette del portale confermano la semantica.** Nella schermata di
riepilogo (`wizard3.html`, catturata in `sconto_e_pagamento_misto.har`) i campi
sono resi così:

- `totaleImponibile` → "Totale imponibile **al lordo dello sconto** €"
- `scontoTotale` → "Sconto totale **al netto dell'IVA** €"
- `ammontareComplessivo` → "Totale complessivo €"
- `totaleNonRiscosso` → "Totale non riscosso €"

È una conferma indipendente dai numeri: `scontoTotale` è dichiarato dall'AdE
stessa come sconto **al netto dell'IVA**, cioè Σ `scontoUnitario` e non
Σ `scontoLordo` (voce #11 punto 1), e `totaleImponibile` è dichiarato **al
lordo dello sconto**, cioè prima della sottrazione.

**Verifica incrociata** (vale sempre, buon invariante per i test):

```
totaleImponibile − scontoTotale + importoTotaleIva = ammontareComplessivo
1.90909091      − 0.09090909   + 0.08181818       = 1.90000000  ✓
```

(l'identità regge solo in assenza di omaggi; con omaggi il membro sinistro li
include e il destro no.)

---

## 5. Quadratura dei pagamenti

L'invariante che il portale impone prima di abilitare l'invio:

```
Σ vendita[].importo + scontoAbbuono = ammontareComplessivo
```

Sulla voce #1: `0.50 + 1.00 + 0.00 + 0.00 + 0.00 + 0.00 + 0.40 = 1.90` ✓

Equivalente alla forma già presente in `docs/api-spec.md` sez. 3.4
(`PC + PE + TR = ammontareComplessivo − totaleNonRiscosso − scontoAbbuono`).

**Conseguenza per la UI:** in un carrello con pagamento misto, il residuo fra
totale e somma degli importi inseriti è esattamente ciò che deve finire in
`scontoAbbuono` — oppure l'invio va bloccato. Non esiste un terzo esito.

---

## 6. Codici pagamento: `PC`, `PE`, `TR`, `NR_EF`, `NR_PS`, `NR_CS`

L'array `vendita[]` è presente **solo** nelle vendite (mai negli annulli, voce
#9) e contiene **sempre tutti e sei gli slot**, anche quelli a zero. Il portale
non li omette mai.

⚠️ **L'ordine non è stabile fra POST e GET.** La POST li invia
`PC, PE, TR, NR_EF, NR_PS, NR_CS`; la GET di un documento esistente
(`annullo.har`) li restituisce `PC, PE, TR, NR_CS, NR_EF, NR_PS`. Leggerli per
indice invece che per `tipo` è un bug in attesa.

### I sei slot, come li rende il portale

Ricavato dal markup del wizard, catturato verbatim negli HAR:
`wizard2-v.html` (form di input, in `vendita.har`) e `wizard3.html`
(riepilogo, in `sconto_e_pagamento_misto.har`).

| Codice  | Etichetta AdE                             | Controllo UI               | Esposto oggi |
| ------- | ----------------------------------------- | -------------------------- | ------------ |
| `PC`    | Pagamento in contanti €                   | input importo (2 dec)      | ✅ sì        |
| `PE`    | Pagamento con strumenti elettronici €     | input importo (2 dec)      | ✅ sì        |
| `TR`    | Ticket Restaurant €                       | input importo + `numero`   | ❌ no        |
| `NR_EF` | Emissione fattura                         | **checkbox** `'Y'` / `'N'` | ❌ no        |
| `NR_PS` | Prestazioni di servizi €                  | input importo (2 dec)      | ❌ no        |
| `NR_CS` | Credito per cessione di bene consegnato € | input importo (2 dec)      | ❌ no        |

`TR` è l'unico slot con il campo `numero` (numero di buoni pasto, stringa):
vale `"0"` quando l'importo è zero, ed è **obbligatorio** quando l'importo è
diverso da `"0.00"` (`data-ng-required` nel markup). Gli altri cinque non hanno
`numero`.

### `NR_EF` NON è un importo: è un interruttore

Questo è il punto che il solo payload non rivela — nelle tre catture vale
sempre `{"tipo":"NR_EF","importo":"0.00"}`, indistinguibile dagli altri.

Nel form di input `NR_EF` è una **casella di spunta**:

```html
<input
  type="checkbox"
  id="i2_4_4"
  data-ng-model="vm.vendita_NR_EF._checked"
  data-ng-true-value="'Y'"
  data-ng-false-value="'N'"
/>
<label>Emissione fattura</label>
```

con il tooltip: _"Spuntare questo campo nel caso di prestazione di servizi
continuativi con emissione di fattura a fine periodo"_. Nel riepilogo è resa
come "Emissione fattura: Sì / No", non come un importo.

**E quando è spuntata, disabilita e svuota tutti e cinque gli altri campi** —
`PC`, `PE`, `TR`, `NR_PS`, `NR_CS` portano tutti
`data-ng-disabled="vm.vendita_NR_EF._checked == 'Y'"` e il corrispondente
`data-empty-if`. Non è quindi "una quota non incassata" da sommare alle altre:
è una dichiarazione che l'**intero** documento non è incassato perché la
fattura arriverà a fine periodo. È mutuamente esclusiva con qualunque altra
forma di pagamento.

**Conseguenza:** `totaleNonRiscosso = NR_EF + NR_PS + NR_CS` (che stava in
`docs/api-spec.md` e che il mapper implementa in `mapSaleToAdePayload`) tratta
un flag booleano come un addendo. Oggi è innocuo — i tre slot sono sempre a
zero e la somma dà `0.00`, che è il valore giusto — ma la formula **non è
verificata** e non va usata come base per esporre le `NR_*`.

**Cosa resta ignoto:** come `_checked` finisca nel payload. Il modello ha
comunque un `vendita_NR_EF.importo` (compare anche nella GET), quindi non è
escluso che a casella spuntata l'importo venga valorizzato col totale del
documento — nel qual caso la formula tornerebbe vera come identità aritmetica,
pur restando sbagliata come descrizione. Serve una cattura con la casella
spuntata per deciderlo; finché non c'è, la voce #15 la elenca fra i limiti.

### Decisione presa

Per ora si espongono all'utente e alla Developer API **solo `PC` e `PE`**.
`TR` e le tre `NR_*` restano documentate qui perché il payload le richiede
comunque a zero, e perché il giorno che si aprono non serva ripartire da capo.
Il mapper le regge già tutte (`PAYMENT_TYPE_MAP` in `src/lib/ade/mapper.ts`,
`AdePaymentType` in `src/lib/ade/types.ts`); quel che manca è a monte (input) e
a valle (lettura) — voce #14. Ma `NR_EF` **non** va esposta come un importo:
nel nostro modello sarebbe un booleano, non un `PaymentRequest`.

---

## 7. Righe omaggio: escluse da `ammontareComplessivo`

**Fonte:** `vendita.har` (cattura precedente, due righe entrambe a natura `N2`).

```
riga 1  qta 1.00  imponibile 3.20  scontoLordo 1.50  totale 1.70  omaggio "N"
riga 2  qta 2.00  imponibile 2.00  scontoLordo 1.00  totale 1.00  omaggio "Y"

totaleImponibile     = 3.20 + 2.00 = 5.20   ← omaggio incluso
scontoTotale         = 1.50 + 1.00 = 2.50   ← omaggio incluso
ammontareComplessivo =        1.70          ← omaggio ESCLUSO (non 2.70)
```

Una riga con `omaggio: "Y"` concorre a imponibile e sconti ma **non**
all'importo dovuto dal cliente. Coerente: un omaggio non si incassa.

Oggi la UI non emette mai omaggi (`isGift` è cablato a `false` in
`src/lib/services/receipt-service.ts`), quindi il caso è dormiente — ma
`mapSaleToAdePayload` somma `totale` su **tutte** le righe, quindi il giorno
che si abilita l'omaggio manderebbe un `ammontareComplessivo` gonfiato e la
quadratura della voce #5 salterebbe. Vedi voce #11 punto 4.

---

## 8. Layout del PDF stampato dall'AdE

Testo estratto dal PDF restituito da
`GET /ser/api/documenti/v1/doc/documenti/{idtrx}/stampa/?regalo=false` per il
documento della voce #1:

```
Test
Partita IVA/CF: XXXXXXXXXXX
Corso S, 22

DOCUMENTO COMMERCIALE
di vendita o prestazione

Qta  Descrizione Prodotto  Aliquota      Prezzo complessivo €  Sconto  Omaggio
1    Prova senza sconto    Non soggette  1.00                  0.00
1    Prova con sconto      10%           1.00                  0.10

Totale imponibile:      1.82
Totale IVA:             0.08
Totale complessivo: €   1.90
Pagato contante:        0.50
Pagamento elettronico:  1.00
Sconto a pagare:        0.40

Documento N. DCW2026/2610-5298 del 18/08/2026 19:05:10
```

Due cose importanti:

1. **`Totale imponibile` stampato = `totaleImponibile − scontoTotale`**, cioè
   l'imponibile **netto** (`1.90909091 − 0.09090909 = 1.81818182` → `1.82`),
   non il campo `totaleImponibile` del payload. Chi legge solo il PDF e chi
   legge solo il JSON vede due numeri diversi: non è un errore.
2. `1.82 + 0.08 = 1.90` — imponibile netto + IVA quadrano col totale
   complessivo. **È questa la quadratura che si rompe se si arrotondano i
   netti a 2 decimali**: vedi voce #10.

La colonna `Sconto` mostra `scontoLordo`; la colonna `Prezzo complessivo €`
mostra `prezzoLordo` (vedi voce #12 per il caso quantità > 1).

⚠️ **Questo è il PDF del portale DCO, non il layout normativo.** Il documento
commerciale ufficiale stampa lo sconto di riga come una **riga propria** e non
come una colonna, e mette lo sconto a pagare **dentro** il blocco pagamenti:
è la voce #17 a governare il nostro renderer.

---

## 9. Annullo di un documento con sconti e pagamento misto

**Fonte:** `annullo_doc_sconto_e_pagamento_misto.har` (3 entry), annullo del
documento emesso nella voce #1.

**Esito: nessuna novità.** Il payload di annullo è il documento originale
rispedito verbatim, con le stesse differenze già note da `annullo.har`:

| Rispetto al payload di vendita            | Annullo                                      |
| ----------------------------------------- | -------------------------------------------- |
| `vendita[]`                               | **assente** (nessun pagamento in un annullo) |
| `scontoAbbuono`                           | **mantenuto** (`"0.40"`)                     |
| `elementiContabili[].idElementoContabile` | valorizzato (`"394577235"`, `"394577236"`)   |
| `resoAnnullo`                             | `{ tipologia: "A", dataOra, progressivo }`   |
| `numeroProgressivo`                       | progressivo originale                        |
| `idtrx` (root)                            | `"226076907"` (idtrx originale)              |
| `altriDatiIdentificativi.nuovoUtente`     | `true`                                       |
| Tutti i totali e le righe                 | **identici** al documento originale          |

Risposta: `{"esito":true,"idtrx":"226077439","progressivo":"DCW2026/2610-5829","errori":[]}`

Il PDF di annullo **non stampa** né i pagamenti né lo sconto a pagare, pur
essendo `scontoAbbuono` presente nel payload:

```
DOCUMENTO COMMERCIALE
emesso per ANNULLAMENTO
Documento di riferimento: N. DCW2026/2610-5298
... (stesse righe) ...
Totale imponibile:      1.82
Totale IVA:             0.08
Totale complessivo: €   1.90
```

**Conseguenza implementativa:** `mapVoidToAdePayload`
(`src/lib/ade/mapper.ts`) costruisce già l'annullo rieccheggiando il documento
letto da AdE via `getDocument(idtrx)`, `scontoAbbuono` incluso. **Non serve
alcuna modifica al ramo annullo** per supportare sconti e pagamento misto: il
lavoro è tutto sul ramo vendita.

---

## 10. Gli 8 decimali sono precisione vera, non padding

`docs/api-spec.md` sez. 7 diceva che gli 8 decimali visti negli HAR erano
cosmetici e che 2 decimali bastavano. **Falso** appena entra uno sconto su una
riga con IVA.

Il portale calcola imponibili, sconti netti e IVA **senza arrotondare ai
centesimi**: `0.90909091`, `0.09090909`, `0.08181818` sono la divisione esatta
troncata a 8 decimali. Solo i **lordi** (`prezzoLordo`, `scontoLordo`,
`totale`, `ammontareComplessivo`, `vendita[].importo`, `scontoAbbuono`) sono
grandezze in centesimi.

**Perché non è cosmetico.** Con il nostro arrotondamento attuale a 2 decimali,
il documento della voce #1 diventerebbe:

```
                        portale AdE     nostro codice oggi
prezzoUnitario riga 2   0.90909091      0.91
imponibile     riga 2   0.90909091      0.91
imponibileNetto riga 2  0.81818182      0.82
importoIVA     riga 2   0.08181818      0.08
totaleImponibile        1.90909091      1.91
scontoTotale            0.09090909      0.10
importoTotaleIva        0.08181818      0.08
```

e il PDF stampato dall'AdE (voce #8, punto 1) mostrerebbe

```
Totale imponibile:    1.81      (1.91 − 0.10)
Totale IVA:           0.08
Totale complessivo:   1.90      ← 1.81 + 0.08 = 1.89 ≠ 1.90
```

**un centesimo di sbilancio su un documento fiscale irreversibile.**

**Senza sconti il problema non si presenta**: per ogni riga vale comunque
`imponibileNetto + importoIVA = totale` perché `importoIVA` è calcolato per
differenza dal lordo cent-esatto. È esattamente per questo che la produzione
oggi funziona, e per cui la voce #14 sub-task A è **prerequisito** dello
sconto di riga.

**Regola da tenere.** I lordi restano in centesimi interi (regola 17 di
`CLAUDE.md`, non è in discussione); la **scomposizione** netto/IVA si calcola
a piena precisione e si serializza a 8 decimali. Le due cose sono compatibili:
è esattamente quello che fa il portale.

Campi a **2** decimali (non 8): `quantita`, `resiPregressi`, `reso`,
`scontoAbbuono`, `vendita[].importo`.

**Il markup del wizard lo conferma.** Gli `<input>` del portale portano un
attributo `data-smart-float` che ne dichiara la precisione: `-11.2` sugli
importi di pagamento (`PC`, `PE`, `TR`, `NR_PS`, `NR_CS`) e su `scontoAbbuono`,
`-11.8` su `scontoLordo` di riga. Due decimali contro otto, dichiarati
dall'AdE stessa nel form — non è un dettaglio di serializzazione che possiamo
scegliere.

**Arrotondamento, non troncamento.** `1.00 / 1.1 = 0.909090909…` e l'AdE manda
`"0.90909091"`: troncando l'ottavo decimale sarebbe `0.90909090`. È l'unico
campione che distingue le due cose (negli altri coincidono), ed è decisivo.
`toAdeAmount8` (`src/lib/ade/mapper.ts`) fa già `Math.round(v * 1e8) / 1e8`:
è corretto, e **non** va sostituito con un troncamento. I campioni non
distinguono half-up da half-even — nessuno cade esattamente a metà — ma la
differenza è di 1e-8 su valori che l'AdE ha accettato per anni anche a 2
decimali: non è un rischio reale.

---

## 11. Divergenze fra il nostro mapper e il portale — ✅ CHIUSA

Il confronto di `mapper.ts` contro le voci #2, #4, #7 e #10 aveva trovato sei
divergenze. **Cinque sono state chiuse dal sub-task A** (`scontoTotale`
lordo-invece-che-netto, arrotondamento intermedio dei netti, `scontoUnitario`
unitario-invece-che-di-riga, omaggi sommati in `ammontareComplessivo`, e
`prezzoLordo` moltiplicato per la quantità): gli oracoli in `mapper.test.ts`
le inchiodano campo per campo, quindi non possono tornare.

Resta aperta una sola cosa, deliberatamente: **`flagIdentificativiModificati`**
— entrambi gli HAR mandano `false`, il mapper manda `true`. L'AdE accetta
entrambi e la produzione funziona; è un rischio accettato, registrato in
`REVIEW.md` sotto "Rischi accettati". Non toccarlo senza un motivo.

---

## 12. `prezzoLordo` è il prezzo **unitario** — confermato

**Fonte:** `nuovo_test_sconto.har`, cattura del 19/08/2026. Documento
costruito apposta per disambiguare: **una riga, quantità 2, aliquota 22%,
prezzo unitario lordo 3,00 €, sconto 1,00 €** — numeri scelti in modo che le
due letture possibili (sconto di riga vs sconto per unità) diano risultati
diversi.

**Riga inviata dal portale:**

```json
{
  "quantita": "2.00",
  "descrizioneProdotto": "doppio",
  "prezzoLordo": "3.00000000",
  "prezzoUnitario": "2.45901639",
  "scontoUnitario": "0.81967213",
  "scontoLordo": "1.00000000",
  "aliquotaIVA": "22",
  "importoIVA": "0.90163934",
  "imponibile": "4.91803279",
  "imponibileNetto": "4.09836066",
  "totale": "5.00000000",
  "omaggio": "N"
}
```

Totali di documento: `totaleImponibile "4.91803279"`,
`scontoTotale "0.81967213"`, `scontoTotaleLordo "1.00000000"`,
`importoTotaleIva "0.90163934"`, `ammontareComplessivo "5.00000000"`,
`scontoAbbuono "0.00"`, pagamento `PC "5.00"`.
Risposta: `{"esito":true,"idtrx":"226275524","progressivo":"DCW2026/2630-3915","errori":[]}`

**Due conferme, entrambe definitive:**

1. **`prezzoLordo` è il prezzo UNITARIO.** Vale `3.00`, non `6.00`. La
   quantità non ci entra: è `imponibile` a valere `prezzoUnitario × quantita`
   (`2.45901639 × 2 = 4.91803279`).
2. **`scontoLordo` è lo sconto DELLA RIGA, non per unità.** Vale `1.00` e
   `totale` vale `5.00`: se fosse per unità il totale sarebbe
   `6.00 − 2.00 = 4.00`. Di conseguenza `scontoUnitario = scontoLordo / d`
   **senza** moltiplicare per la quantità (`1.00 / 1.22 = 0.81967213`), il che
   conferma anche che il suffisso _-Unitario_ significa "al netto IVA" e non
   "per unità" (voce #2).

Verifica completa (`r = 22`, `d = 1.22`):

```
prezzoUnitario  = 3.00 / 1.22              = 2.45901639
imponibile      = 2.45901639 × 2           = 4.91803279
scontoUnitario  = 1.00 / 1.22              = 0.81967213
imponibileNetto = 4.91803279 − 0.81967213  = 4.09836066
importoIVA      = 4.09836066 × 0.22        = 0.90163934
totale          = 4.09836066 + 0.90163934  = 5.00000000
                = 3.00 × 2 − 1.00          = 5.00000000  ✓
```

**Il PDF stampato dall'AdE** per questo documento mostra
`Prezzo complessivo € = 6,00`: l'AdE **ricalcola** quella colonna dal payload,
non stampa `prezzoLordo` tal quale. Da questo campione non si distingue se usi
`prezzoLordo × quantita` o `imponibile × d` — nel payload del portale
coincidono. Ed è il motivo per cui mandare il prezzo **unitario** è l'unica
scelta sicura: sotto entrambe le formule si è corretti, mentre mandandolo già
moltiplicato ogni riga con quantità > 1 stamperebbe un valore gonfiato (qui
12,00 invece di 6,00) su un documento fiscale.

Il mapper manda il prezzo unitario dal sub-task A in poi, e l'oracolo di
questa voce lo inchioda campo per campo in `mapper.test.ts`.

⚠️ `unitDiscount` nel nostro DTO (`SaleLineRequest`) è per unità **per nostra
scelta**, ed è coerente: `scontoLordo = unitDiscount × quantity` produce lo
sconto di riga che l'AdE si aspetta. Quel che non va fatto è passare
`unitDiscount` direttamente a `scontoUnitario`, che è tutt'altra grandezza.

---

## 13. Lotteria degli scontrini: incompatibile col pagamento misto

**Regola AdE** (testo del portale, confermato dall'owner il 19/08/2026):

> Il Codice Lotteria del Cliente non può essere indicato su documenti di
> importo inferiore ad 1 euro o non pagati esclusivamente con mezzi
> elettronici.

Due condizioni **cumulative**, entrambe necessarie:

1. `ammontareComplessivo` ≥ 1,00 €;
2. il documento è pagato **esclusivamente** con mezzi elettronici.

**Conseguenza diretta: col pagamento misto il codice lotteria non è mai
ammesso.** Qualunque slot diverso da `PE` con importo > 0 — `PC`, `TR`, e le
tre `NR_*` (che non sono nemmeno un incasso) — squalifica il documento. La
condizione operativa è quindi: `PE` è l'**unico** slot non a zero.

**Sulla soglia di 1 euro.** Si misura sull'`ammontareComplessivo`, cioè sul
corrispettivo, non sull'incassato: lo sconto a pagare non riduce il
corrispettivo (voce #3b), quindi non può far scendere uno scontrino sotto
soglia. È già ciò che fa `resolveLotteryCode`
(`src/lib/services/receipt-service.ts`), che confronta
`calcInputLinesTotalCents` con 100 — quella logica resta valida invariata.

**Lo sconto a pagare NON squalifica il documento.** Verificato sul portale
(19/08/2026): totale 2,00 €, pagamento elettronico 1,00 €, sconto a pagare
1,00 € → **il codice lotteria è accettato**. "Esclusivamente con mezzi
elettronici" si riferisce quindi a come è composto l'**incassato**, non a
quanta parte del corrispettivo viene incassata: `scontoAbbuono` non è un mezzo
di pagamento e non entra nel test. La condizione resta quella sopra — `PE`
unico slot non a zero — **senza** alcun vincolo su `scontoAbbuono`.

Nota sulla soglia: in quel campione sia il totale (2,00 €) sia la quota
elettronica (1,00 €) erano ≥ 1,00 €, quindi il caso non distingue su quale dei
due l'AdE applichi il minimo. Vale la lettura letterale del testo — "documenti
di **importo** inferiore ad 1 euro", cioè l'importo del documento — che è anche
quella già implementata.

**Dove vive adesso questa regola.** Il predicato è
`isElectronicOnly` (`src/lib/receipts/lottery-code-schema.ts`), usato dallo
schema Zod e — soprattutto — da `resolveLotteryCode` nel service, che è il
gate autoritativo: lo schema è una cortesia per il client. In cassa il campo
si disabilita con la ragione scritta appena una quota è in contanti, invece di
essere ignorato in silenzio: un codice digitato e mai trasmesso è peggio di un
campo assente.

---

## 14. Guida all'implementazione (sub-task ordinati) — ✅ TUTTI SPEDITI

I cinque sub-task in cui questo registro era stato tradotto sono tutti in
produzione. La spec dettagliata di ciascuno è servita una volta e non serve
più: quello che decideva ora è inchiodato da codice e test, ed è lì che va
letto. Questa voce resta perché il codice la cita.

| Sub-task                        | Dove vive adesso                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **A** — precisione del mapper   | `computeLineAmounts` + `mapSaleToAdePayload`, con gli oracoli delle voci #1 e #12 in `mapper.test.ts`               |
| **B** — lettura pagamento misto | `parsePublicRequest` / `resolvePaymentRows` (`src/lib/receipts/public-request.ts`), consumati da tutte le superfici |
| **C** — input pagamento misto   | `paymentsSchema` + `refinePaymentDeclaration` (`receipt-schema.ts`), gate Pro in `pro-feature-gates.ts`             |
| **D** — sconto a pagare         | `globalDiscountSchema` + `refineGlobalDiscount`, reso in PDF/termica/ricevuta pubblica                              |
| **E** — sconto di riga          | colonna `line_discount` (migrazione 0034), `refineSaleLineDiscounts`, riga `Sconto` propria nella stampa (#17a)     |

Due decisioni prese lungo la strada che il codice non spiega da solo:

- **L'ordine delle voci di pagamento è normalizzato** su quello del tracciato
  (`PC` prima di `PE`, voce #6) in lettura, in ingresso e nel fingerprint di
  idempotenza. Senza, le stesse voci in ordine diverso producono scontrini
  diversi.
- **`payments` si persiste sempre in `public_request`**, `paymentMethod` solo
  quando la modalità è una. È ciò che fa produrre da sé il `null` che
  `/api/v1` espone sui misti, senza un ramo dedicato nella route.

### Cosa NON serve fare

- **Il ramo annullo.** Voce #9: `mapVoidToAdePayload` rieccheggia il documento
  originale e non ha bisogno di sapere nulla di sconti o pagamenti.
- **Una migrazione per il pagamento misto o lo sconto a pagare.** Vivono in
  `public_request` (`jsonb`). Solo lo sconto di riga ha toccato il DB.

---

## 15. Cosa NON è stato misurato (limiti noti di questo registro)

Le voci #1-#13 sono misurate su payload reali accettati dall'AdE. Quanto segue
**non** lo è: sta qui perché un lettore futuro sappia dove finisce l'evidenza
e comincia l'inferenza.

**`TR` e le tre `NR_*` non sono mai state osservate con importo > 0.** Restano
ignoti come `NR_EF._checked = 'Y'` finisca nel payload, se un importo non
riscosso entri nella quadratura della voce #5 come un incasso, e il formato di
`TR.numero`. **Decisione dell'owner (27/08/2026): quegli slot non li vogliamo
gestire**, quindi non sono un debito — sono fuori perimetro, e il markup
descritto nella voce #6 basta a spiegare perché lo schema pubblico espone solo
`PC` e `PE`.

**Righe omaggio con aliquota IVA.** L'unico omaggio osservato (voce #7) è a
natura `N2`, quindi con `importoIVA = 0`. Non sappiamo se l'IVA di una riga
omaggio con aliquota entri in `importoTotaleIva`: sappiamo solo che la riga
concorre a `totaleImponibile` ed è esclusa da `ammontareComplessivo`. Il mapper
gestisce già `omaggio: "Y"` correttamente, ma `isGift` è cablato a `false` nel
service — **questa domanda va chiusa con una cattura prima di abilitare gli
omaggi**, ed è l'unico limite di questo elenco che blocchi davvero qualcosa.

### Chiusi dopo la stesura

**La quadratura del pagamento misto è imposta dall'AdE.** Confermato
dall'owner (27/08/2026): il portale web **non permette l'invio** se la somma
dei pagamenti non corrisponde al totale da pagare. Resta comunque
responsabilità nostra imporla a monte (`refinePaymentDeclaration`, in
centesimi interi): un rifiuto lato AdE arriverebbe dopo il round-trip, e
l'esercente lo vedrebbe come un'emissione fallita invece che come un errore di
compilazione.

**Documenti multi-aliquota con più righe scontate.** Non esiste un campione
catturato, ma il buco di copertura è chiuso da un test: tre righe scontate su
tre aliquote diverse (22%, 10% e una natura) con l'invariante di documento
asserito su tutte e tre — `mapper.test.ts`, "non accumula errore su piu' righe
scontate ad aliquote diverse".

**La soglia di 1 euro della lotteria** — su quale importo si applichi: vedi la
nota in coda alla voce #13. Vale la lettura letterale, che è quella
implementata.

---

## 16. Ricevuta di annullamento: dati, stampa e timestamp

**Fonte:** `annullo.har` (7 entry), `annullo_doc_sconto_e_pagamento_misto.har`
(3 entry), `nuovo_test_annullo.har` (7 entry). Cattura misurata per la v1.7.0
("memorizzare progressivo documento AdE di annullamento e stampare ricevuta di
annullamento"). Il **payload** di annullo resta quello della voce #9: qui c'è
tutto il resto — la stampa, gli identificativi e la ricerca.

### 16a. Layout del PDF di annullo

Misurato sul PDF di `GET /doc/documenti/{idtrxAnnullo}/stampa/?regalo=false`,
estratto dal base64 dentro `nuovo_test_annullo.har` [06] — un HAR non è solo
le chiamate API. Il nostro renderer lo implementa (`commercial-document.ts`,
ramo `VOID`), quindi qui resta solo **cosa distingue un annullo da una
vendita**:

- il sottotitolo diventa **"emesso per ANNULLAMENTO"**;
- compare **"Documento di riferimento: N. \<progressivo dell'annullato\>"**;
- **spariscono le righe di pagamento e `Sconto a pagare`** — pur essendo
  `scontoAbbuono` presente nel payload (voce #9): un annullo non incassa;
- il footer porta progressivo e istante **dell'annullo**, non dell'originale;
- i metadati del PDF ripetono il riferimento fuori dal testo stampato:
  `/Title (DOCUMENTO COMMERCIALE DI ANNULLO DEL DOCUMENTO … )`.

Il campione riconfermava per via indipendente tre formule già note (voci #8 e
#12) su un documento diverso da quello della voce #1: `Prezzo complessivo` =
`prezzoLordo × quantita`, `Sconto` = `scontoLordo` già comprensivo della
quantità, e `Totale imponibile` stampato = `totaleImponibile − scontoTotale`.

### 16b. Il timestamp dell'annullo NON è nella risposta — è nell'header `Date`

La risposta alla `POST` di annullo è **solo** questa:

```json
{
  "esito": true,
  "idtrx": "226275972",
  "progressivo": "DCW2026/2630-4363",
  "errori": []
}
```

Nessun timestamp. Ma il footer del PDF ne stampa uno al secondo
(`del 19/08/2026 09:53:41`). **Misurato su tutti e tre gli HAR:** quel valore
coincide con l'header HTTP `Date` della risposta alla POST, convertito in
Europe/Rome.

| HAR                                    | `Date` della POST               | Footer del PDF        | `data` in ricerca     |
| -------------------------------------- | ------------------------------- | --------------------- | --------------------- |
| `annullo.har`                          | `Mon, 23 Feb 2026 09:07:02 GMT` | _(PDF non catturato)_ | `23/02/2026 10:07:02` |
| `annullo_doc_sconto_e_pagamento_misto` | `Tue, 18 Aug 2026 17:06:02 GMT` | `18/08/2026 19:06:02` | `18/08/2026 19:06:02` |
| `nuovo_test_annullo.har`               | `Wed, 19 Aug 2026 07:53:41 GMT` | `19/08/2026 09:53:41` | `19/08/2026 09:53:41` |

Tre fonti indipendenti concordi (header, stampa, lista di ricerca), su tre
catture e due fusi (CET e CEST). **Decisione v1.7.0:** catturare l'header
`Date` della risposta AdE in `RealAdeClient` e persisterlo (`ade_registered_at`),
invece di usare l'orologio nostro (`updatedAt` della riga VOID, che deriva di
qualche secondo) o di spendere una chiamata in più. La ri-lettura via
`searchDocuments` resta il fallback diagnostico, non il percorso normale.

### 16c. `tipoOperazione`: `V`, `A`, `R` — e la doppia semantica di `annulli`

Codici del `<select id="tipoOperazione">` del portale: `V` =
Vendita/Prestazione, `A` = Annullo, `R` = Reso. Il markup ne esclude due dal
dropdown (`['AX','RX'].indexOf(k) == -1`): esistono nel modello ma non sono
selezionabili in ricerca. `GET /doc/documenti/?tipoOperazione=A` è una query
valida — `ricerca.har` [04] la esegue e ritorna 4 annulli.

**Trappola.** Il campo `annulli` della lista di ricerca è **polisemico**, come
`NR_EF` (voce #6) è un flag e non un importo:

| Riga della lista      | `annulli`             | Significato                              |
| --------------------- | --------------------- | ---------------------------------------- |
| `tipoOperazione: "V"` | `"A"` (stringa fissa) | **flag**: il documento è stato annullato |
| `tipoOperazione: "A"` | `"DCW2026/2610-5298"` | **progressivo del documento annullato**  |

Leggere `annulli` come progressivo su una riga `V` scrive la stringa `"A"` dove
ci si aspetta un numero documento. Rilevante per la v1.8.0 (sync documenti da
AdE), dove serve proprio a ricostruire la catena vendita → annullo.

Esempio (`nuovo_test_annullo.har` [01], lista senza filtro — la coppia
vendita/annullo della voce #1):

```json
{ "idtrx": "226077439", "numeroProgressivo": "DCW2026/2610-5829",
  "data": "18/08/2026 19:06:02", "tipoOperazione": "A",
  "annulli": "DCW2026/2610-5298", "ammontareComplessivo": 1.9 },
{ "idtrx": "226076907", "numeroProgressivo": "DCW2026/2610-5298",
  "data": "18/08/2026 19:05:10", "tipoOperazione": "V",
  "annulli": "A", "ammontareComplessivo": 1.9 }
```

### 16d. Copertura dei dati della ricevuta — ✅ SPEDITA

La v1.7.0 ha chiuso il giro: la riga VOID salva progressivo e idtrx
dell'annullo, il footer stampa l'istante ricavato dall'header `Date`
(`ade_registered_at`, migrazione 0031), e la ristampa vive in
`void-receipt-dialog.tsx`. La tabella elemento-per-fonte che stava qui era la
checklist di quel lavoro: non serve più.

### 16e. Annullo di un documento con codice lotteria

`cfCessionarioCommittente` **trasporta il codice lotteria**, non un codice
fiscale (`mapper.ts`: `cfCessionarioCommittente: doc.lotteryCode ?? ""`). Il
documento annullato in `annullo.har` lo ha valorizzato con un codice a 8
caratteri, e l'annullo lo rieccheggia identico: **l'AdE lo accetta**
(`esito: true`). Il caso "annullo di uno scontrino con lotteria" è quindi
coperto sul filo.

**Il PDF di annullo NON stampa il codice lotteria** — confermato dall'owner
(27/08/2026). Era l'unica assunzione non misurata della v1.7.0, presa perché
il PDF di `annullo.har` [06] è l'unico dei tre con `content` vuoto nella
cattura. Ora è chiusa: il nostro renderer di annullo fa la cosa giusta a non
stamparlo.

---

## 17. Layout ufficiale AdE: dove vanno i due sconti sul documento stampato

**Fonte:** `Layout documento commerciale v4`, PDF normativo pubblicato
dall'Agenzia delle Entrate —
<https://www.agenziaentrate.gov.it/portale/documents/20143/2571432/Layout+documento+commerciale_v4.pdf/>

⚠️ **Questa voce non è misurata su un HAR** ed è l'eccezione dichiarata alla
convenzione del file: sta qui perché è la sorgente che risolve la stampa dei
due sconti, e la voce #8 — che è misurata — da sola induce in errore. Dove le
due si contraddicono la regola resta quella di questo registro (vince il
misurato), ma **si contraddicono meno di quanto sembri**: la voce #8 è il PDF
che genera il _portale DCO_, questa è il layout normativo del documento
commerciale. Sono due rese diverse dello stesso payload, ed è la seconda che il
nostro renderer deve seguire — `src/lib/pdf/commercial-document.ts` e
`src/lib/printing/receipt-escpos.ts` sono modellati sul layout standard, non
sul PDF del portale.

### 17a. Sconto di riga: una riga propria, non una colonna

Estratto del layout standard, con le coordinate x del PDF a testimoniare
l'allineamento delle colonne:

```
DESCRIZIONE@183                IVA@328
                               22%@331    160,65@377
Sconto@198                     22%@331    -10,65@377
                                4%@337     50,00@383
n.5 * 10,00@198
                               ES*@331    100,01@377

Subtotale@183                             300,01@377
TOTALE COMPLESSIVO@183                    300,01@373
di cui IVA@183                             28,98@380
```

Lo sconto di riga **non** è una colonna accanto al prezzo: è una **riga
propria** subito sotto l'articolo scontato, con la descrizione `Sconto`,
**la stessa aliquota della riga a cui si riferisce** e l'importo **negativo**.

Questo è il motivo per cui l'aliquota va ripetuta: senza, un documento
multi-aliquota non direbbe da quale imponibile lo sconto è stato tolto — che è
esattamente l'informazione fiscale che lo sconto di riga porta (voce #3a).

⚠️ Diverge dalla voce #8, dove il PDF del portale DCO stampa invece una colonna
`Sconto` a destra del prezzo. Entrambe sono rese legittime dello stesso
payload: `scontoLordo` sulla riga. Per il **nostro** renderer vale 17a.

### 17b. Sconto a pagare: una voce del blocco pagamenti

```
Pagamento contante@183      160,00
Pagamento elettronico@183    80,00
Non riscosso@183             70,00
Resto@183                    10,00
Sconto a pagare@183           0,01
Importo pagato@183          230,00
TOTALE COMPLESSIVO          300,01
```

Tre cose, tutte verificabili sull'aritmetica del campione:

1. **`Sconto a pagare` è l'ultima voce prima di `Importo pagato`**, dentro il
   blocco pagamenti — non una riga dopo il totale. L'etichetta è quella che
   stampa anche il portale reale (voce #8), quindi è confermata da due fonti.
2. **`Importo pagato` ESCLUDE lo sconto a pagare** (e il non riscosso):
   `230,00 = 160,00 − 10,00 di resto + 80,00`. È l'incassato vero.
3. La quadratura del documento si chiude sui tre addendi:
   `230,00 + 70,00 + 0,01 = 300,01 = TOTALE COMPLESSIVO`, che è la stessa
   identità della voce #5 vista dal lato della stampa.

### 17c. Prescrizioni generali per il risparmio carta

- niente righe vuote di spaziatura superiori a 1;
- **niente campi di resto e/o modalità di pagamento con valore pari a zero** —
  e quindi niente riga `Sconto a pagare` quando l'abbuono è zero;
- **`Importo pagato` va invece indicato sempre**, anche a zero.

Il renderer PDF e quello ESC/POS applicano già la seconda e la terza al metodo
di pagamento: la riga `Sconto a pagare` segue la stessa regola.

### 17d. Arrotondamento DL 50/2017 — non implementato, ma la regola è nota

L'art. 13-quater del DL 50/2017, in vigore dal 1° gennaio 2018, impone di
arrotondare al multiplo di 5 centesimi più vicino **solo quando il pagamento è
integralmente in contanti**. Regola completa (fonte: owner, 27/08/2026):

| Ultima cifra dei centesimi | Verso                 | Esempio         |
| -------------------------- | --------------------- | --------------- |
| 1, 2, 6, 7                 | per **difetto**       | 5,02 € → 5,00 € |
| 3, 4, 8, 9                 | per **eccesso**       | 5,03 € → 5,05 € |
| 0, 5                       | nessun arrotondamento | 5,05 € → 5,05 € |

Tre vincoli che la regola porta con sé:

1. **Solo contanti.** Con carta, bancomat o app l'importo resta esatto al
   centesimo. Su un **pagamento misto** non si applica: basta una quota
   elettronica perché il documento non sia "integralmente in contanti".
2. **Sul totale, mai sul singolo prezzo.** L'arrotondamento si calcola sul
   totale complessivo dello scontrino.
3. **Non tocca la base imponibile IVA.** Come lo sconto a pagare (voce #3b),
   serve solo a far quadrare il contante realmente incassato.

**Le due direzioni usano voci diverse sul documento stampato:**

- **per difetto** → è uno `Sconto a pagare` (importo negativo, es. −0,02 €),
  che sappiamo già rappresentare: `scontoAbbuono` esiste ed è esposto;
- **per eccesso** → è una voce di pagamento in **più** del corrispettivo,
  `Arrotondamento a pagare` (es. +0,02 €). Il layout normativo la chiama
  `Arro. DL N.50/2017`.

**Perché non è implementato.** Il caso per difetto è già producibile a mano
con lo sconto a pagare, e dà un documento **corretto nei totali e nella
quadratura**, solo senza la dicitura dedicata. Il caso per eccesso invece non
è esprimibile affatto: servirebbe un settimo slot di pagamento che aumenta
l'incassato oltre il corrispettivo, e **nessuno dei sei slot della voce #6 si
chiama così**. Non sappiamo se il tracciato del _documento commerciale online_
lo preveda: serve una cattura fatta apposta.

Tracciato in `REVIEW.md` #96. Nulla di questo blocca gli sconti o il pagamento
misto: è il perimetro di ciò che non risolvono.
