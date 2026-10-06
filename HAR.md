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
- Issue GitHub — bug noti e tech debt. Le divergenze fra questo registro e il
  codice attuale che vanno _fixate_ hanno un'issue.
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
| 18  | Utenza di lavoro `incaricato`: il wizard in tre POST              |
| 19  | Reso merce: payload, resi parziali, ricerca e stampa              |

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
`docs/architecture/accepted-risks.md`. Non toccarlo senza un motivo.

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

**La scelta dell'utenza di lavoro è misurata solo sul ramo `incaricato`.** La
voce #18 chiude il caso di chi rappresenta una o più società; restano non
osservati i rami `delega` e `tutore`, il cambio utenza senza re-login e il
comportamento su una società cessata — elenco puntuale in 18.6.

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
ci si aspetta un numero documento.

**Esito v1.8.0.** La doppia semantica ha deciso la forma della ricerca: poiché
il flag "annullato" sta **già sulla riga di vendita**, lo storico interroga le
sole `tipoOperazione=V` e deriva lo stato da lì — una query per pagina invece
di due, e nessuna riga `A` da riconciliare. Il prezzo è che sui documenti che
vivono solo su AdE non conosciamo la **data** dell'annullo, che starebbe sulla
riga `A`: accettabile su un elenco di sola lettura, e il motivo per cui la
colonna `data_annullo` del CSV resta vuota su quelle righe.

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

### 16f. Limiti e capacità della ricerca — misurati sul portale live

**Fonte:** verifica diretta sul portale con un'utenza reale (settembre 2026),
non una cattura HAR. Le catture in nostro possesso interrogano finestre brevi
e non toccavano nessuno di questi limiti.

**1. I 31 giorni sono un vincolo dell'API, e risponde `406 Not Acceptable`.**
Misurato in due punti. L'interfaccia si ferma prima: con un intervallo più
largo **disabilita il pulsante Cerca** e mostra "L'intervallo temporale non
può essere superiore a 31 giorni", quindi nessuna richiesta parte. Ma
riproponendo la stessa GET a mano con `dataDal`/`dataInvioAl` oltre la
finestra, l'endpoint risponde **HTTP 406**. Non tronca in silenzio: rifiuta.

Il 406 è la risposta migliore fra quelle possibili — un troncamento
silenzioso avrebbe prodotto elenchi incompleti dall'aria completa, invisibili
senza un controllo incrociato. Qui l'errore è esplicito e lo vedremmo subito.

**Conseguenza sul disegno: il chunking a mesi solari non è prudenza, è
obbligatorio.** Un periodo più lungo si spezza in una query per mese
(`buildAdeSearchRanges`) perché un mese non supera mai i 31 giorni, quindi il
vincolo non si può violare per costruzione. Le query girano dalla più recente
alla più vecchia: se la lettura si ferma per tempo scaduto, ciò che manca è la
coda remota del periodo, non i documenti di ieri.

> ⚠️ Questa voce ha cambiato idea due volte, e la storia serve a chi la legge.
> Prima stesura: "vincolo dell'API" — era un'inferenza dal comportamento
> dell'interfaccia, presentata come misura. Seconda: "limite della sola
> interfaccia, l'API è ignota" — corretta ma incompleta. Terza, questa: il
> vincolo è dell'API, provato dal 406. La conclusione operativa non è mai
> cambiata, la sua solidità sì.

**2. `perPage` è onorato ben oltre i 10 dell'interfaccia.** Su un mese che il
portale mostrava impaginato in **due pagine**, `perPage=100` ha restituito
`totalCount: 17` e **17 elementi in una sola risposta**. È un caso che
discrimina (17 > 10): il portale non ricapa al valore che usa lui. Non è
misurato il comportamento oltre il centinaio di documenti in una finestra.

Conseguenza diretta sul disegno: una ricerca annuale costa **una dozzina di
richieste**, non qualche centinaio, e il deadline interno da 45s passa da rete
di sicurezza stretta a margine comodo.

**3. L'archivio va indietro almeno due anni e mezzo.** Una ricerca su marzo
2024, eseguita a settembre 2026, restituisce i documenti corretti. "Da inizio
anno" è quindi sempre ottenibile, e il tetto di `ADE_SEARCH_MAX_DAYS` (366) è
interamente una nostra scelta sul costo del merge in memoria — non un limite
imposto dalla ritenzione.

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

Tracciato nell'issue #991. Nulla di questo blocca gli sconti o il pagamento
misto: è il perimetro di ciò che non risolvono.

---

## 18. Utenza di lavoro `incaricato`: il wizard in tre POST

**Fonte:** cattura del 16/09/2026 su un'utenza Fisconline che rappresenta
quattro società (`ivaservizi.agenziaentrate.gov.it.har`, 120 entry). È la prima
cattura di un account **non** a entità singola: fino a qui ogni HAR veniva da
utenze in cui la P.IVA è intestata alla persona, dove il portale salta del tutto
questo passo. Chiude l'ipotesi lasciata aperta dall'issue #984 e la issue
Sentry SCONTRINOZERO-13.

**Mascheramento.** Le quattro P.IVA reali sono rese `<PIVA-A>` … `<PIVA-D>`, il
codice fiscale della persona `<CF-PERSONA>`, la denominazione `ACME SRL`. Le
distinzioni contano (sono quattro valori diversi), i valori no.

### 18.1 `wizardTemplate` non ha `PIva`, ha `richiestaIncarichi`

`GET /instr/instradamento-fatture-rest/rs/wizardTemplate` con header `x-appl`,
subito dopo il login, risponde `200`:

```json
{
  "cfUidUltimo": "<CF-PERSONA>",
  "soloPerMe": false,
  "hasDelega": false,
  "intermediario": false,
  "tutore": false,
  "tutore_AT": false,
  "serpico": false,
  "enabledEsercizioOpzioni": false,
  "enabledQrCode": false,
  "enabledVerificaPivaCf": false,
  "richiestaIncarichi": {
    "incarichi": [
      {
        "deleghe": false,
        "intermediario": false,
        "tutore": false,
        "incaricante": { "cf": "<PIVA-A>", "sede": "FOL", "tipo": "INCARICO" }
      },
      {
        "deleghe": false,
        "intermediario": false,
        "tutore": false,
        "incaricante": { "cf": "<PIVA-B>", "sede": "FOL", "tipo": "INCARICO" }
      },
      {
        "deleghe": false,
        "intermediario": false,
        "tutore": false,
        "incaricante": { "cf": "<PIVA-C>", "sede": "FOL", "tipo": "INCARICO" }
      },
      {
        "deleghe": false,
        "intermediario": false,
        "tutore": false,
        "incaricante": { "cf": "<PIVA-D>", "sede": "FOL", "tipo": "INCARICO" }
      }
    ]
  }
}
```

Tre letture che il codice non sa dire da solo:

- **La chiave `PIva` è assente, non vuota.** Le società non stanno lì: stanno in
  `richiestaIncarichi.incarichi[]`, che è una lista separata. `PIva` compare solo
  **dopo** che l'incaricante è stato scelto (18.3).
- **`incaricante.cf` contiene la partita IVA**, non un codice fiscale a 16
  caratteri: sono le P.IVA delle società a 11 cifre. Il nome del campo mente.
- **`soloPerMe` non gate-a "Me stesso".** La prima stesura di questa voce
  diceva che `soloPerMe: false` è il segnale che "Me stesso" non è
  disponibile. È **falso**, e lo dice il codice del portale (18.7): la voce
  "Me stesso" è nell'elenco delle personae **sempre**, senza condizione.
  `soloPerMe: true` serve a tutt'altro — insieme a `PIva` di lunghezza 1 fa
  saltare il wizard per intero. Su questa utenza le due letture coincidevano
  per caso, e l'errore è rimasto in piedi fino a che non è arrivata un'utenza
  con entrambe le personae.

`incarichi[]` **non contiene le denominazioni**: solo P.IVA, `sede` e `tipo`. Chi
deve mostrare un elenco leggibile di società ha due sole strade — visualizzare le
P.IVA nude, oppure chiamare `procediWizard` una volta per incarico (18.3) per
risolvere i nomi. Ha un costo di N round-trip, e va deciso conoscendolo.

### 18.2 `procediWizard`, passo 1 — scelta della persona

`POST /instr/instradamento-fatture-rest/rs/procediWizard?v={ts}`, header `x-appl`

- `Content-Type: application/json`:

```json
{ "tipoutenza": "incaricato" }
```

Risposta `200`: **lo stesso identico payload di `wizardTemplate`**. Il passo non
aggiunge informazione — è il portale che avanza lo stato del wizard lato server.
Salterlo non è verificato: la cattura lo contiene e per ora va replicato.

Il valore è `"incaricato"` in minuscolo, non `"Incaricato"` né `"INCARICO"`
(che è invece il valore di `incaricante.tipo`). Tre grafie diverse nello stesso
flusso.

### 18.3 `procediWizard`, passo 2 — scelta dell'incaricante

Stesso endpoint, secondo POST:

```json
{
  "tipoutenza": "incaricato",
  "incaricante": "{\"deleghe\":false,\"incaricante\":{\"cf\":\"<PIVA-B>\",\"sede\":\"FOL\",\"tipo\":\"INCARICO\"},\"intermediario\":false,\"tutore\":false}",
  "tipoincaricante": "incaricoDiretto",
  "pIva": null
}
```

**`incaricante` è una stringa, non un oggetto.** È l'intera entry di
`incarichi[]` ri-serializzata con `JSON.stringify` e annidata come valore
testuale dentro il body. Non è un dettaglio cosmetico: mandare l'oggetto invece
della stringa è il tipo di errore che non si indovina e che si scopre solo da una
cattura.

`tipoincaricante` vale `"incaricoDiretto"`. `pIva` è `null` a questo passo.

Risposta `200`: il payload di 18.1 **più** la chiave `PIva`, adesso popolata per
il solo incaricante scelto:

```json
"PIva": [ { "danteCausa": false, "denominazione": "ACME SRL", "piva": "<PIVA-B>" } ]
```

È qui che la denominazione entra nel flusso per la prima volta.

### 18.4 `setUserChoice` — forma diversa da quella `meStesso`

`POST /instr/instradamento-fatture-rest/rs/setUserChoice?v={ts}`:

```json
{
  "tipoutenza": "incaricato",
  "incaricante": "{\"deleghe\":false,\"incaricante\":{\"cf\":\"<PIVA-B>\",\"sede\":\"FOL\",\"tipo\":\"INCARICO\"},\"intermediario\":false,\"tutore\":false}",
  "tipoincaricante": "incaricoDiretto",
  "cf": "<PIVA-B>"
}
```

Confronto con il corpo che inviamo oggi (voce storica, ramo `meStesso`):
`{"cf": <CF persona>, "pIva": <P.IVA>, "tipoutenza": "meStesso"}`.

Le due forme divergono su tre punti, tutti significativi:

- **non c'è nessun campo `pIva`** nel ramo incaricato;
- **`cf` porta la partita IVA della società**, non il codice fiscale della
  persona che ha fatto il login;
- compaiono `incaricante` e `tipoincaricante`, che nel ramo `meStesso` non
  esistono.

Non è quindi un parametro da rendere variabile: sono **due body diversi** che
condividono il nome del campo `tipoutenza`.

Risposta `200`, con il vettore di autorizzazioni:

```json
{
  "PIva": [ { "denominazione": "ACME SRL", "piva": "<PIVA-B>", "stato": "ATTIVA",
              "danteCausa": false, "inizioAttivita": 1331510400000, "fineAttivita": 0,
              "opzioni": { "corrispettivi": { "attiva": false, "dataInizio": 0, "dataScadenza": 0 },
                           "datiFattura":   { "attiva": false, "dataInizio": 0, "dataScadenza": 0 } } } ],
  "vettoreAutorizzazioni": {
    "servizi": [ {"codice":"I31","permessi":["I31_DEFAULT"]}, {"codice":"I33",…},
                 {"codice":"I34",…}, {"codice":"I38",…}, {"codice":"I42",…}, {"codice":"I44",…} ],
    "utenteDiLavoro": { "cfUid": "<PIVA-B>", "cfUltimo": "<PIVA-B>", "tipo": "INCARICO",
                        "partitaIva": { … stessa forma di PIva[0] … } }
  }
}
```

`stato: "ATTIVA"` e `fineAttivita: 0` dicono che la P.IVA è viva: sono il
candidato naturale per distinguere "società cessata" da "delega revocata" quando
un domani il flusso fallirà su un'utenza che prima funzionava.

`opzioni.corrispettivi.attiva` e `opzioni.datiFattura.attiva` sono **entrambe
`false`** su un'utenza che opera regolarmente: riguardano l'adesione al servizio
di _consultazione_, non l'emissione. Non vanno lette come un gate sul documento
commerciale.

### 18.5 Il resto della coda regge senza modifiche

- **`fullTemplate` risponde `406` prima della scelta e `200` dopo.** È una probe
  gratuita di "c'è un'utenza di lavoro attiva su questa sessione?", più netta di
  dedurlo da un endpoint di business.
- **`gestori/me` risponde `404`** anche su questa utenza, esattamente come per
  SPID: il fallback già implementato su `dati/fiscali` è la strada giusta e non
  va toccato.
- **`dati/fiscali` restituisce l'identità della società**, non della persona:
  `partitaIva` e `codiceFiscale` valgono entrambi `<PIVA-B>`, con denominazione e
  sede legale della società. L'identity guard continua quindi a funzionare senza
  modifiche strutturali — confronta la P.IVA giusta.
- **`x-appl` è lo stesso token** dal login fino a `setUserChoice`: i due
  `procediWizard` lo richiedono come gli altri. Nessun token aggiuntivo.

### 18.5-bis Due risposte osservate a video, non sul tracciato

Raccolte guardando il portale durante la cattura del 16/09/2026. Sono
osservazioni dirette, non misure sull'`.har`: affidabili sul _cosa_, mute sul
_come_ (nessun endpoint associato).

- **Il menu di scelta dell'incaricante mostra soltanto le partite IVA**, in una
  tendina, senza denominazioni. Coerente con `incarichi[]`, che i nomi non li
  porta. Per noi toglie un costo che sembrava obbligato: un picker con le sole
  P.IVA non è un degrado, è quello che fa il portale stesso. La denominazione la
  possiamo comunque mostrare **dopo** la scelta, perché arriva nella risposta del
  secondo `procediWizard` (18.3) — una chiamata che facciamo comunque.
- **Cambiare utenza senza rifare il login è possibile**: il portale riporta alla
  schermata "Me stesso / Incaricato" e il wizard riparte da lì. L'endpoint di
  reset non è stato catturato, quindi non sappiamo _quale_ sia. Conseguenza che
  conta più del meccanismo: **legare un account ScontrinoZero a una sola P.IVA è
  una nostra scelta di prodotto, non un vincolo imposto dall'AdE**, e come tale
  va spiegata all'utente. Lato implementazione non cambia nulla: il replay
  headless rifà comunque il login da zero a ogni sessione.

### 18.5-ter Il passo di scelta P.IVA vale anche per "Me stesso" (18/09/2026)

Osservazione diretta dell'owner sull'interfaccia del portale, due giorni dopo la
cattura e su un'utenza diversa. Stesso statuto di 18.5-bis. Dove il codice del
wizard (18.7) è più preciso, vale quello: qui restano le due cose che
l'osservazione ha visto per prima e che hanno fatto trovare il resto.

- **Il passo di scelta della partita IVA vale anche per "Me stesso".** Non è un
  passo riservato al ramo incaricato: chi ha partite IVA intestate alla persona
  le sceglie lì, con la stessa schermata.
- **Senza partite IVA si arriva a una schermata che dice che non ce ne sono**, e
  la conferma non è raggiungibile. Il testo non è una stringa del bundle: viene
  dal server, quindi non sappiamo riprodurlo, solo che esiste.

Conteggio dei passi: tre visibili, quattro nel codice — quello di scelta
dell'incaricante si salta per "Me stesso" (18.7). L'osservazione diceva "tre
sempre"; è vero da schermo per questa persona, non in generale.

Quello che questo cambia per noi: `wizardTemplate` non è la fonte delle P.IVA
dirette, è la fonte delle **personae**. Le P.IVA — di qualunque provenienza —
compaiono solo dopo che una persona è stata dichiarata con `procediWizard`
(18.2). Su un'utenza a sola persona il portale ci risparmia il giro e le mette
già in `wizardTemplate`; su un'utenza che ne ha due, no. Leggere `PIva` dal solo
`wizardTemplate` significa quindi non vedere mai le P.IVA dirette di chi ha
anche un incarico — che è esattamente il caso in cui a un esercente veniva
offerta solo la società sbagliata.

Corollario di metodo: il giro di ritorno alla scelta della persona (18.5-bis) è
comodo per un umano davanti al browser, ma a noi non serve. Una sonda che scopre
cosa c'è sotto una persona finisce comunque con l'utente che sceglie, e la
scelta fa ripartire un login pulito.

### 18.7 Il wizard letto dal suo codice

**Fonte:** `instr/InstradamentofcWeb/dist/js/2.bundle.a27e7902afacbb0e50d4.js`,
dentro la stessa cattura del 16/09/2026. È il bundle React del wizard —
minificato ma leggibile, con i nomi delle stringhe intatti. Statuto diverso da
tutto il resto di questa sezione: non è un comportamento osservato da cui
inferire una regola, è **la regola scritta**. Dove il codice e un'osservazione
divergono, vince il codice.

**Le personae sono sei, non due.** Il passo 1 costruisce l'elenco dei radio
così: `meStesso` c'è **sempre**, senza condizione; le altre cinque compaiono
ciascuna dietro un flag di `wizardTemplate`.

| `tipoutenza`               | etichetta a video          | compare quando                        |
| -------------------------- | -------------------------- | ------------------------------------- |
| `meStesso`                 | Me stesso                  | sempre                                |
| `incaricato`               | Incaricato                 | `richiestaIncarichi.incarichi.length` |
| `delegaDiretta`            | Delega diretta             | `hasDelega`                           |
| `tutore`                   | Tutore                     | `tutore \|\| tutore_AT`               |
| `intermediarioNonDelegato` | Intermediario non delegato | `intermediario`                       |
| `serpico`                  | (nessun radio: campo CF)   | `serpico`                             |

Con `serpico: true` i radio spariscono del tutto e il passo 1 diventa un campo
"Codice fiscale del soggetto per cui operare".

**Il body del passo 1 è `{ tipoutenza, cf }`**, e `cf` vale `undefined` per ogni
persona tranne `serpico` — è l'unica per cui la validazione lo pretende. Ecco
perché la cattura mostra `{"tipoutenza":"incaricato"}` e basta (18.2): il campo
non è omesso per scelta, è vuoto. Per "Me stesso" il body è quindi
`{"tipoutenza":"meStesso"}`.

**`procediWizard` sostituisce il template.** Lo store fa
`POST /rs/procediWizard` e sulla risposta esegue `template = result`: da lì in
poi ogni passo legge il template **nuovo**. È il meccanismo per cui le P.IVA
compaiono a metà wizard e non prima — non un effetto collaterale, il disegno.

**`soloPerMe` è la condizione di scorciatoia, non un gate.** Il wizard non
viene mostrato affatto quando `soloPerMe && PIva.length === 1`: in quel caso il
portale manda direttamente `setUserChoice({cf: cfUidUltimo, pIva: PIva[0].piva,
tipoutenza: "meStesso"})` e va alla home. Con `soloPerMe: true` e più di una
P.IVA il wizard si apre regolarmente. Questo chiude la lettura sbagliata di
18.1 e conferma che la nostra fast path — P.IVA già presenti in
`wizardTemplate` → nessuna sonda — corrisponde a quella del portale.

**I passi sono quattro, con due condizioni di salto.**

1. _Scegli utenza di lavoro_ — la persona.
2. _Scegli per chi operare_ — l'incaricante. Saltato se `tipoutenza` non è fra
   `incaricato`, `delegaDiretta`, `intermediarioNonDelegato`.
3. _Scegli partita IVA_ — una tendina di sole P.IVA. Saltato quando
   `PIva.length` **non** è maggiore di 1: con una sola viene preselezionata, con
   nessuna non c'è niente da mostrare.
4. _Riepilogo e conferma_ — `showAlways`.

Per "Me stesso" salta il 2: tre passi a video, che è quello che ha visto
l'osservazione di 18.5-ter. Per un'utenza senza P.IVA saltano il 2 e il 3, e si
arriva alla conferma senza `pIva` — dove `setUserChoice` non ha cosa mandare.

**La sonda `meStesso` restituisce anche la denominazione** (misurato in
produzione il 18/09/2026, primo caso reale). La risposta di
`procediWizard {"tipoutenza":"meStesso"}` porta entry
`{"piva":"…","denominazione":"HAUSER ADELHEID"}`: sulle P.IVA **dirette** il
nome c'è, a differenza degli incarichi (18.1). Non costa una chiamata in più —
è la stessa sonda che facciamo comunque.

Con un'asimmetria che conta a valle: il nome che arriva qui è quello della
**persona**, mentre `dati/fiscali` sulla stessa P.IVA lascia
`altriDatiIdentificativi.denominazione` **vuota** e mette nome e cognome nei
campi dedicati. Due superfici del portale, due risposte diverse sullo stesso
soggetto. La seconda è quella che persistiamo, ed è il motivo per cui
`businesses.ade_denominazione` resta `NULL` per una persona fisica — proprietà
del dato, non un nostro buco.

**`tipoincaricante` è derivato, non costante.** A ogni cambio di incaricante il
portale lo riporta a `incaricoDiretto`, e offre una scelta "Opera come" solo se
l'incarico selezionato ha almeno uno fra `deleghe`, `tutore`, `intermediario`:
allora i valori possibili diventano `incaricoDelega`, `incaricoDelegaMassivo`,
`incaricoTutore`, `incaricoIntermediario`. Ognuno pretende in più un campo
diverso — `cfDelegante`, `pIva` del tutelato, `cfIntermediario`. I tre booleani
sono già dentro l'entry che rimandiamo verbatim, quindi la derivazione è alla
nostra portata: vedi 18.6.

### 18.6 Cosa questa cattura NON dice

- **Il ramo `delega` e il ramo `tutore` in HTTP.** I loro **nomi** e il flag che
  li abilita ora si sanno (18.7); quello che resta non misurato è il traffico
  che producono. Su `tipoincaricante` c'è di più: il portale non usa una
  costante, lo **deriva** dai tre booleani dell'incarico scelto, e
  `incaricoDiretto` è solo il suo default (18.7). Il nostro
  `ADE_TIPO_INCARICANTE` è quel default cablato: corretto finché l'incarico ha
  `deleghe`, `tutore` e `intermediario` tutti falsi, che è il caso dell'unica
  utenza incaricata che abbiamo, e sbagliato per gli altri.
- **Il comportamento con una società cessata o una delega revocata.** Tutte e
  quattro le entry erano valide al momento della cattura.
- **L'emissione vera e propria da utenza incaricata.** La cattura si ferma
  all'apertura del portale: un documento commerciale inviato sarebbe stato un
  atto fiscale reale sulla P.IVA della società. L'owner la dà per funzionante, ed
  è plausibile — dopo `setUserChoice` la sessione si comporta come una normale,
  `dati/fiscali` risponde con l'identità della società e `vettoreAutorizzazioni`
  elenca i servizi — ma resta **inferenza, non misura** (regola 13). Da trattare
  come tale finché la prima emissione reale non la conferma.
- **L'endpoint che riporta alla scelta utenza.** Sappiamo che il giro esiste
  (18.5-bis), non come si chiama. Non è più un buco da chiudere per poter
  procedere: nessun nostro flusso ne ha bisogno (18.5-ter).
- ~~La grafia di `tipoutenza` per il ramo "Me stesso"~~ — **chiusa da 18.7**: è
  `meStesso`, letta nel codice del wizard, non più estrapolata.

---

## 19. Reso merce: payload, resi parziali, ricerca e stampa

**Fonti** (02/10/2026, stessa P.IVA, tutte nella stessa giornata):

| Cattura                                                       | Cosa contiene                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `vendita.har`                                                 | vendita a due righe (2 × "doppio" al 22% con sconto di riga, 1 × "singolo" N2) |
| `reso_parziale_1.har`                                         | reso di 1 "doppio" + 1 "singolo"                                               |
| `reso_parziale_2.har`                                         | reso dell'ultimo "doppio" (la vendita è ora resa per intero)                   |
| `annullo.har`                                                 | **annullo della stessa vendita, già resa per intero — accettato** (19f)        |
| `annullo_reso_non_possibile.har`                              | solo la lista: il portale non offre l'annullo di un documento di reso          |
| `vendita_tripla.har`, `reso_parziale_1/2.har` (seconda serie) | 3 pezzi con sconto di riga, reso di 1 poi di 2: il test sui terzi (19c)        |

Più i PDF scaricati dal portale per ogni documento e il layout normativo
(`Layout documento commerciale_v4.pdf`, pagina 3 "Documento commerciale di
reso: layout standard").

### 19a. Il reso è l'annullo con `tipologia: "R"` e una quantità per riga

Stessa POST di vendita e annullo (`POST /ser/api/documenti/v1/doc/documenti/`).
Il portale prima legge la vendita (`GET .../documenti/?numeroProgressivo=…&tipoOperazione=V`,
poi `GET .../documenti/{idtrx}/`), poi rimanda il documento originale come
l'annullo della voce #9, con queste differenze rispetto alla vendita:

| Campo                                     | Reso                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `vendita[]`                               | **assente** (come l'annullo)                                                      |
| `resoAnnullo`                             | `{ tipologia: "R", dataOra: <data vendita>, progressivo: <progressivo vendita> }` |
| `numeroProgressivo`, `idtrx` (root)       | quelli della **vendita**                                                          |
| `elementiContabili[].idElementoContabile` | quelli reali, letti dal dettaglio GET                                             |
| `elementiContabili[].quantita`            | la quantità **venduta**, invariata                                                |
| `elementiContabili[].reso`                | i pezzi resi **adesso** (0 sulle righe non rese)                                  |
| `elementiContabili[].resiPregressi`       | i pezzi già resi da resi precedenti                                               |
| importi di riga                           | **ricalcolati** sui pezzi resi (19b)                                              |
| totali di documento                       | somme delle righe ricalcolate                                                     |
| `scontoAbbuono`                           | quello della vendita, rimandato ma **non sottratto** (19d)                        |
| `altriDatiIdentificativi.nuovoUtente`     | `true` (come l'annullo)                                                           |

Risposta: `{"esito":true,"idtrx":"247990317","progressivo":"DCW2026/4801-8782","errori":[]}`.
Come per l'annullo, l'istante di registrazione sta nell'header `Date` della
risposta (voce #16b).

**Il dettaglio GET porta il cumulativo.** Nel `GET .../documenti/{idtrx}/`
della vendita il campo di riga `reso` è la quantità **già resa in totale**: `"0"`
prima di ogni reso, `"1"`/`"1"` dopo il primo, `"2"`/`"1"` dopo il secondo. Il
POST successivo lo rimanda come `resiPregressi`. È la fonte della quantità
residua, e copre anche i resi fatti fuori da ScontrinoZero.

Nel form del portale (`wizard2-r.html`) il campo reso di riga ha
`data-smart-float="-11.2"`: due decimali, come `quantita`. Il reso di una
frazione (kg) è ammesso.

### 19b. Le formule di riga del reso

Con `r = reso / quantita` e i campi della vendita letti dal dettaglio GET:

```
imponibile      = prezzoUnitario × reso
scontoUnitario  = scontoUnitario_vendita × r        (sconto di riga NETTO, già di riga)
imponibileNetto = imponibile − scontoUnitario
importoIVA      = imponibileNetto × aliquota        (0 sulle nature)
totale          = imponibileNetto + importoIVA
prezzoLordo, prezzoUnitario, scontoLordo, aliquotaIVA, omaggio  → invariati
```

Ogni risultato a 8 decimali. `scontoLordo` resta lo sconto di riga **della
vendita**, non riproporzionato: è il dato che non cambia mai, come
`prezzoLordo`. Una riga con `reso = 0` ha tutti gli importi a `0.00000000`.

Verifica sulla prima serie (riga "doppio": vendita `quantita 2`,
`prezzoUnitario 0.02459016`, `scontoUnitario 0.00819672`, 22%):

| Campo             | Reso 1 di 2 | Calcolo                          |
| ----------------- | ----------- | -------------------------------- |
| `imponibile`      | 0.02459016  | 0.02459016 × 1                   |
| `scontoUnitario`  | 0.00409836  | 0.00819672 × ½                   |
| `imponibileNetto` | 0.02049180  | 0.02459016 − 0.00409836          |
| `importoIVA`      | 0.00450820  | 0.02049180 × 0.22 = 0.0045081960 |
| `totale`          | 0.02500000  | 0.02049180 + 0.00450820          |

Totali di documento del reso 1 (righe "doppio" 1 di 2 e "singolo" 1 di 1):
`totaleImponibile 0.04459016`, `scontoTotale 0.00409836`,
`scontoTotaleLordo 0.01000000`, `importoTotaleIva 0.00450820`,
`ammontareComplessivo 0.04500000`. Valgono le identità della voce #4.

### 19c. Il portale riproporziona, non chiude sul residuo

Seconda serie: riga "triplo", `quantita 3`, `prezzoLordo 0.01`, sconto di riga
`0.01`, 22% → vendita `totale 0.02`.

| Documento   | `reso` | `resiPregressi` | `scontoUnitario` | `imponibileNetto` | `importoIVA` | `totale`   |
| ----------- | ------ | --------------- | ---------------- | ----------------- | ------------ | ---------- |
| Vendita     | —      | —               | 0.00819672       | 0.01639344        | 0.00360656   | 0.02000000 |
| Reso 1 di 3 | 1.00   | 0.00            | 0.00273224       | 0.00546448        | 0.00120219   | 0.00666667 |
| Reso 2 di 3 | 2.00   | 1.00            | 0.00546448       | 0.01092896        | 0.00240437   | 0.01333333 |

Anche l'ultimo reso è calcolato in proporzione (`× 2/3`), **non** come residuo
"vendita meno resi precedenti". Qui la somma torna lo stesso
(`0.00666667 + 0.01333333 = 0.02000000`); in generale può scostarsi di
`1e-8`, irrilevante. Il nostro mapper fa lo stesso.

### 19d. Lo sconto a pagare non si riproporziona

`scontoAbbuono` viaggia identico in ogni reso (`"0.01"` in entrambi i resi della
prima serie) e **non** viene sottratto da `ammontareComplessivo`. È coerente con
la voce #3b: lo sconto a pagare non riduce il corrispettivo, quindi il reso
storna il corrispettivo pieno. Prima serie: vendita `0.07`, resi
`0.045 + 0.025 = 0.07`, saldo zero — anche se il cliente aveva pagato `0.06`.
Quanto rimborsare è una scelta commerciale dell'esercente, non un dato fiscale.

### 19e. Ricerca: `resi` ha due significati, come `annulli`

```json
{ "idtrx": "247990854", "numeroProgressivo": "DCW2026/4801-9319",
  "tipoOperazione": "R", "resi": "DCW2026/4801-7890", "ammontareComplessivo": 0.025 },
{ "idtrx": "247990317", "numeroProgressivo": "DCW2026/4801-8782",
  "tipoOperazione": "R", "resi": "DCW2026/4801-7890", "ammontareComplessivo": 0.045 },
{ "idtrx": "247989425", "numeroProgressivo": "DCW2026/4801-7890",
  "tipoOperazione": "V", "annulli": "A", "resi": "R", "ammontareComplessivo": 0.07 }
```

Su una riga `V`, `resi: "R"` è il **flag** "ha almeno un reso"; su una riga
`R` è il **progressivo della vendita**. Una vendita può avere più righe `R`
con lo stesso `resi`: per riconciliare un reso in sospeso non basta il
progressivo, serve anche l'importo.

**L'importo in lista ha piena precisione, e `data` è l'istante del reso.**
Lista letta dall'owner sul portale il 06/10/2026, stessa P.IVA, con le righe
della seconda serie (voce #19c):

```json
{ "idtrx": "248003680", "numeroProgressivo": "DCW2026/4803-2145",
  "data": "02/10/2026 16:40:44", "tipoOperazione": "R",
  "resi": "DCW2026/4803-1413", "ammontareComplessivo": 0.01333333 },
{ "idtrx": "248003292", "numeroProgressivo": "DCW2026/4803-1757",
  "data": "02/10/2026 16:39:54", "tipoOperazione": "R",
  "resi": "DCW2026/4803-1413", "ammontareComplessivo": 0.00666667 },
{ "idtrx": "248002948", "numeroProgressivo": "DCW2026/4803-1413",
  "data": "02/10/2026 16:39:09", "tipoOperazione": "V",
  "resi": "R", "ammontareComplessivo": 0.02 }
```

- I due resi in terzi tornano con gli 8 decimali trasmessi, nessun
  arrotondamento al centesimo né ai tre decimali. Il confronto a 8 decimali
  di `reconcileReturnDocument` è quello giusto. Conta perché metà dei resi con
  IVA esce dal centesimo di 1e-8 anche con prezzi al centesimo (`4 × 0,01` al
  22% reso per intero vale `0.03999999`): una lista arrotondata li avrebbe
  dati per assenti in riconciliazione.
- `data` è l'istante di registrazione del **reso**, non quello della vendita:
  vendita alle 16:39:09, resi alle 16:39:54 e 16:40:44. Coincide al secondo
  con il footer "Documento N. … del …" dei PDF di tutti e tre i documenti,
  forniti dall'owner, e sulla prima serie con quello del reso
  `DCW2026/4801-8782` (`16:15:16`, voce #19g). È il comportamento già misurato
  sugli annulli (voce #16b).

### 19f. Il portale NON impedisce l'annullo di una vendita resa

`annullo.har` annulla la vendita della prima serie **dopo** che i due resi
l'avevano già resa per intero: `esito: true`. Il payload è quello della voce
#9 con `resiPregressi` valorizzati (`"2.00"`, `"1.00"`), `reso` a zero e gli
importi **pieni** della vendita. Effetto sui corrispettivi della giornata:
`+0.07 − 0.045 − 0.025 − 0.07 = −0.07`, uno storno doppio.

Conseguenza: le guardie le mette il nostro codice. Niente annullo di una
vendita con almeno un reso (letto dal dettaglio GET, non solo dal DB), niente
reso di una vendita annullata (letto dal flag `annulli` della riga `V`).

L'inverso il portale lo gestisce: per un documento di reso **non** offre
l'annullo (`annullo_reso_non_possibile.har` contiene solo la lista). I codici
`AX`/`RX` del modello (voce #16c) restano non osservati.

### 19g. Stampa

PDF del portale per il reso 1:

```
DOCUMENTO COMMERCIALE
emesso per RESO
Documento di riferimento: N. DCW2026/4801-7890

Qta Rese  Descrizione Prodotto  Aliquota      Prezzo complessivo €  Sconto
   1      doppio                22%                   0.03          0.01
   1      singolo               Non soggette          0.02          0.00

Totale imponibile:      0.04
Totale IVA:             0.00
Totale complessivo: €   0.04
Documento N. DCW2026/4801-8782 del 02/10/2026 16:15:16
```

`/Title` del PDF: `DOCUMENTO COMMERCIALE DI RESO DEL DOCUMENTO DCW2026/4801-7890`.
Nessun blocco pagamenti. Il portale arrotonda male i mezzi centesimi:
`0.045` stampato `0.04`, `0.025` stampato `0.03` (errore del float binario).
Il layout normativo (pagina 3) è quello dell'annullo con "emesso per RESO" e
"Documento di riferimento: N. … del …": come per la voce #17, per la stampa
vince il layout ufficiale, non il PDF del portale.

### 19h. Una chiamata che il portale fa e noi no

Prima di **ogni** POST — vendita, reso e annullo — il portale chiama
`GET /ser/api/documenti/v1/doc/posrt/presenza/collegamento` e riceve
`{"presenza_collegamento": false}`. Le nostre emissioni passano senza: è un
controllo dell'interfaccia, presumibilmente legato all'abbinamento POS-cassa
2026 (`/help/normativa-pos-2026`). Non misurato cosa cambi con `true`.

### 19i. Cosa queste catture NON dicono

- **Un reso in un giorno diverso dalla vendita.** Tutte le catture sono del
  02/10. `documentoCommerciale.dataOra` e `resoAnnullo.dataOra` portano la data
  della vendita; il nostro mapper fa come l'annullo, che in produzione funziona
  anche a giorni di distanza, ma per il reso è inferenza.
- **Il reso di una riga omaggio** e di una vendita con codice lotteria o
  `totaleNonRiscosso` diverso da zero.
- **`flagIdentificativiModificati`**: il portale lo manda `false` su vendita,
  reso e annullo; il nostro mapper dell'annullo lo manda `true` e l'AdE lo
  accetta. Per il reso seguiamo l'annullo.
- **Un reso oltre la quantità residua.** Non provato: non sappiamo se l'AdE
  lo rifiuta. Lo impediamo noi.
- **Il reso di una vendita emessa fino alla v1.7.0.** Quel mapper mandava
  `prezzoUnitario` di riga (voce #11): sulle sue righe da più pezzi le formule
  della voce #19b stornano un multiplo dell'importo. Non sappiamo cosa faccia
  il portale su quei documenti né se l'AdE rifiuti un reso più grande della
  vendita. Lo impediamo noi (`isReturnComputable`).
