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
| `totaleNonRiscosso`    | `NR_EF + NR_PS + NR_CS`                               |

⚠️ `scontoTotale ≠ scontoTotaleLordo` appena c'è **uno sconto su una riga con
aliquota IVA**: nella voce #1 valgono rispettivamente `0.09090909` e
`0.10000000`. Coincidono solo quando tutte le righe scontate sono a natura
`N*`. Vedi voce #11 punto 1.

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
#9) e contiene **sempre tutti e sei gli slot**, nell'ordine sotto, anche quelli
a zero. Il portale non li omette mai.

| Codice  | Significato                          | Esposto oggi | Note                           |
| ------- | ------------------------------------ | ------------ | ------------------------------ |
| `PC`    | Pagamento contante                   | ✅ sì        |                                |
| `PE`    | Pagamento elettronico                | ✅ sì        | copre carta, bonifico, app     |
| `TR`    | Ticket restaurant                    | ❌ no        | ha il campo extra `numero`     |
| `NR_EF` | Non riscosso — emissione fattura     | ❌ no        | concorre a `totaleNonRiscosso` |
| `NR_PS` | Non riscosso — prestazioni servizi   | ❌ no        | concorre a `totaleNonRiscosso` |
| `NR_CS` | Non riscosso — credito cessione bene | ❌ no        | concorre a `totaleNonRiscosso` |

`TR` è l'unico slot con il campo `numero` (numero di buoni pasto, stringa):
vale `"0"` quando l'importo è zero. Gli altri cinque slot non hanno `numero`.

I codici sono già tutti mappati nel codice
(`PAYMENT_TYPE_MAP` in `src/lib/ade/mapper.ts`) e nei tipi
(`AdePaymentType` in `src/lib/ade/types.ts`): **il mapper regge già tutti e
sei**. Quel che manca è a monte (input) e a valle (lettura) — voce #14.

**Decisione presa:** per ora si espongono all'utente e alla Developer API
**solo `PC` e `PE`**. `TR` e le tre `NR_*` restano documentate qui perché il
payload le richiede comunque a zero, e perché il giorno che si aprono non
serva un nuovo HAR.

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

**Arrotondamento, non troncamento.** `1.00 / 1.1 = 0.909090909…` e l'AdE manda
`"0.90909091"`: troncando l'ottavo decimale sarebbe `0.90909090`. È l'unico
campione che distingue le due cose (negli altri coincidono), ed è decisivo.
`toAdeAmount8` (`src/lib/ade/mapper.ts`) fa già `Math.round(v * 1e8) / 1e8`:
è corretto, e **non** va sostituito con un troncamento. I campioni non
distinguono half-up da half-even — nessuno cade esattamente a metà — ma la
differenza è di 1e-8 su valori che l'AdE ha accettato per anni anche a 2
decimali: non è un rischio reale.

---

## 11. Divergenze fra il nostro mapper e il portale

Confronto di `src/lib/ade/mapper.ts` contro le voci #2, #4, #7, #10. Ordinate
per gravità.

1. **`scontoTotale` manda il lordo invece del netto.** Il codice assegna lo
   stesso valore (Σ `scontoLordo`) sia a `scontoTotale` che a
   `scontoTotaleLordo`. Corretto: `scontoTotale` = Σ `scontoUnitario`
   (netto). Invisibile finora perché `unitDiscount` è cablato a `0`.
2. **`computeLineAmounts` arrotonda i netti a 2 decimali.** Vedi voce #10:
   innocuo oggi, rompe la quadratura del PDF appena c'è uno sconto su riga con
   IVA.
3. **`scontoUnitario` riceve `line.unitDiscount`** (lordo, per unità) mentre
   deve essere lo sconto **di riga** al **netto** (`scontoLordo / d`). Doppio
   errore: lordo-vs-netto e unitario-vs-riga.
4. **`ammontareComplessivo` somma anche le righe omaggio.** Vedi voce #7.
   Dormiente finché `isGift` resta `false`.
5. **`flagIdentificativiModificati`** — entrambi gli HAR mandano `false`, il
   mapper manda `true`. L'AdE accetta entrambi (la produzione funziona); non
   toccare senza un motivo, ma è annotato per non ri-scoprirlo.

6. **`prezzoLordo` è moltiplicato per la quantità.** Il codice manda
   `unitPriceGross × quantity` dove il portale manda il prezzo **unitario**, e
   di conseguenza mette in `prezzoUnitario` il netto dell'**intera riga**
   invece che dell'unità. Confermato dalla voce #12: è l'unica divergenza già
   osservabile in produzione oggi, su qualunque scontrino con quantità > 1.

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

**Il PDF stampato dall'AdE** per questo documento:

```
Qta  Descrizione Prodotto  Aliquota  Prezzo complessivo €  Sconto  Omaggio
2    doppio                22%       6.00                  1.00

Totale imponibile:      4.10
Totale IVA:             0.90
Totale complessivo: €   5.00
Pagato contante:        5.00
```

La colonna `Prezzo complessivo €` vale **6,00**: l'AdE la **ricalcola** dal
payload, non stampa `prezzoLordo` tal quale. Da questo campione non si
distingue se la formula usata sia `prezzoLordo × quantita` oppure
`imponibile × d` — nel payload del portale coincidono entrambe a 6,00.

**Perché la distinzione non serve.** Mandando `prezzoLordo` **unitario** si è
corretti sotto entrambe le formule. Mandandolo già moltiplicato — come fa il
codice oggi — si è corretti solo sotto la seconda, e sotto la prima ogni riga
con quantità > 1 stampa un valore gonfiato (per questo documento: 12,00 invece
di 6,00) su un documento fiscale. Non c'è motivo di correre il rischio.

**Il cambio è sicuro.** `imponibile`, `totale` e `ammontareComplessivo` non si
muovono, quindi non cambia né ciò che l'AdE accetta né la riconciliazione del
recovery, che confronta i **totali** dei documenti. Nel codice nessuno legge
`prezzoLordo`: lo scrive solo `computeLineAmounts`, e il ramo annullo lo
rieccheggia verbatim dalla GET (`mapVoidToAdePayload`, entrambi in
`src/lib/ade/mapper.ts`).

**Fix** — voce #14, sub-task A:

```
prezzoLordo    = unitPriceGross                 (NON × quantity)
prezzoUnitario = unitPriceGross / d             (netto UNITARIO)
imponibile     = prezzoUnitario × quantity
scontoLordo    = unitDiscount × quantity        (invariato: sconto di riga)
scontoUnitario = scontoLordo / d
```

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

**Cosa cambiare quando si implementa il pagamento misto** (sub-task C della
voce #14):

- `refineLotteryCode` (`src/lib/receipts/lottery-code-schema.ts`) oggi riceve
  `{ paymentMethod: "PC" | "PE" }`. Va portato su `payments[]` e la condizione
  diventa: codice ammesso solo se `PE` è l'unico importo > 0. Non confrontare
  l'importo `PE` col totale — lo sconto a pagare rende legittimamente i due
  valori diversi.
- `resolveLotteryCode` (`src/lib/services/receipt-service.ts`) — stesso
  predicato lato service, che è quello autoritativo: lo schema Zod è una
  cortesia per il client, il service è il gate.
- UI cassa: nel momento in cui l'esercente ripartisce l'importo su più metodi,
  il campo codice lotteria va disabilitato con una spiegazione esplicita, non
  semplicemente ignorato in silenzio — altrimenti l'esercente digita un codice
  che non finirà mai sul documento.

---

## 14. Guida all'implementazione (sub-task ordinati)

Regola 5 di `CLAUDE.md`: ogni sub-task qui sotto è un PR separato, con branch
proprio e TDD (test prima). **L'ordine non è negoziabile**: A è prerequisito di
E, e B è prerequisito di C — le superfici di lettura devono saper interpretare
un pagamento misto _prima_ che la cassa permetta di emetterne uno.

### Sub-task A — precisione del mapper (prerequisito di E)

**File:** `src/lib/ade/mapper.ts`, `src/lib/ade/mapper.test.ts`.
**Non tocca** né UI né API né DB. Chiude tutte e sei le divergenze della voce
#11: cinque sono latenti (si manifestano solo con gli sconti, oggi cablati a
zero), la sesta — `prezzoLordo` — è già attiva in produzione su ogni scontrino
con quantità > 1.

Riscrivere `computeLineAmounts` secondo le voci #2 e #12:

1. Mantenere il calcolo in centesimi interi dei **lordi**
   (`lineGrossCents`, `discountCents`) — regola 17, non toccare.
2. Calcolare `d = 1 + r/100` una volta (`d === 1` per le nature: nessun ramo
   `if` separato serve).
3. `prezzoLordo = unitPriceGross` — il prezzo **unitario**, NON moltiplicato
   per la quantità (voce #12). `scontoLordo` resta invece
   `unitDiscount × quantity`: è lo sconto **della riga**.
4. `prezzoUnitario = prezzoLordo / d` (netto **unitario**),
   `scontoUnitario = scontoLordo / d`,
   `imponibile = prezzoUnitario × quantita`,
   `imponibileNetto = imponibile − scontoUnitario`,
   `importoIVA = imponibileNetto × r / 100` — **senza** `Math.round(... * 100) / 100`.
   `toAdeAmount8` arrotonda già all'ottavo decimale in serializzazione (vedi
   voce #10: l'AdE **arrotonda**, non tronca).
5. `totale` resta `(lineGrossCents − discountCents) / 100` (cent-esatto).
6. In `mapSaleToAdePayload`: `scontoTotale` = Σ `scontoUnitario`,
   `scontoTotaleLordo` = Σ `scontoLordo` — due somme distinte.
7. `totaleImponibile` e `importoTotaleIva` vanno sommati a **piena
   precisione**, non via `sumLineCents` (che arrotonda ogni addendo ai
   centesimi). `ammontareComplessivo` invece **resta** su `sumLineCents`: è un
   lordo e deve restare cent-esatto per riconciliare con `payments[].amount`
   (regola 17, REVIEW.md #57).

**Test obbligatori** — i documenti delle voci #1 e #12 sono i due oracoli, e
insieme coprono quantità 1 e 2, due aliquote diverse e una natura:

- Riga 1,00 € @10% con sconto 0,10 €, qta 1 → i 15 campi esatti della voce #1.
- Riga 3,00 € @22% con sconto 1,00 €, **qta 2** → i 15 campi esatti della voce
  #12. È il test che inchioda `prezzoLordo = "3.00000000"` (non `6.00`) e
  `scontoUnitario = "0.81967213"` (non `1.63934426`).
- Documento completo della voce #1 → tutti i totali esatti, compresi
  `scontoTotale = "0.09090909"` ≠ `scontoTotaleLordo = "0.10000000"`.
- Invariante di riga: `imponibileNetto + importoIVA === totale` su una tabella
  di aliquote (`4`, `5`, `10`, `22`) × sconti.
- Invariante di documento:
  `totaleImponibile − scontoTotale + importoTotaleIva === ammontareComplessivo`.
- Regressione: senza sconti, i valori prodotti oggi non cambiano (nature `N*`
  e aliquote), e `ammontareComplessivo` resta cent-esatto sulle quantità
  frazionarie (i test REVIEW.md #57 esistenti devono restare verdi invariati).

### Sub-task B — pagamento misto, superfici di lettura (prima di C)

**Perché prima.** Nel momento in cui il primo scontrino misto viene emesso,
storico, PDF, ricevuta pubblica, stampa termica e analytics devono già saperlo
leggere. Rilasciare l'input prima della lettura significa produrre documenti
fiscali che l'app mostra sbagliati.

Oggi il metodo è uno scalare `publicRequest.paymentMethod`. Il formato
persistito diventa **additivo**:

```jsonc
{
  // sempre presente, canonico
  "payments": [
    { "type": "PC", "amount": 0.5 },
    { "type": "PE", "amount": 1.0 },
  ],
  // presente SOLO quando payments ha un solo elemento (compatibilità lettori vecchi)
  "paymentMethod": "PE",
}
```

Scrivere **un solo helper condiviso** che normalizza un `publicRequest` (nuovo
o storico) in `readonly { type, amount }[]`, e farlo consumare da tutti i
lettori — niente parsing duplicato:

- `src/app/r/[documentId]/page.tsx` — oggi `publicReq?.paymentMethod ?? "PC"`
- `src/server/storico-actions.ts` — `parsePublicRequest`
- `src/server/analytics-helpers.ts` — `normalizePaymentMethod`; decidere come
  attribuire il ricavo di uno scontrino misto (proposta: **per importo**, non
  per documento, altrimenti i totali per metodo non sommano al fatturato)
- `src/lib/receipt-format.ts` — `PAYMENT_LABELS` regge già più righe
- stampa termica (`src/lib/printing/`) e generatore PDF
- `src/app/api/v1/receipts/route.ts` e `src/app/api/v1/receipts/[id]/route.ts`
  — nelle **response** aggiungere `payments[]` accanto a `paymentMethod`, che
  resta valorizzato per gli scontrini a metodo singolo e diventa `null` sui
  misti (nessun consumer esistente si rompe: oggi non esistono misti)

Documenti storici: nessuna migrazione: `publicRequest` è `jsonb` e l'helper
tratta `paymentMethod` assente/`payments` assente come i due casi legacy.

### Sub-task C — pagamento misto, input (cassa + Developer API)

**Nessun breaking change su `/api/v1`.** Il body accetta **o**
`paymentMethod` (scalare, come oggi) **o** `payments[]`, mutuamente esclusivi;
il server normalizza subito a `payments[]` canonico.

- `src/lib/receipts/receipt-schema.ts` — aggiungere
  `paymentsSchema = z.array(z.object({ type: z.enum(["PC","PE"]), amount: … }))`
  e un `.superRefine` che imponga: esattamente uno fra `paymentMethod` e
  `payments`; importi non negativi; almeno un importo > 0; **somma degli
  importi + `scontoAbbuono` = totale righe** (voce #5), confrontata in
  **centesimi interi** via `calcInputLinesTotalCents`
  (`src/lib/receipts/receipt-totals.ts`) — mai in float.
- Solo `PC` e `PE` nell'enum (voce #6). `TR`/`NR_*` restano fuori dallo schema
  pubblico anche se il mapper li regge.
- `src/types/cassa.ts` — `SubmitReceiptInput` guadagna `payments`;
  `PaymentMethod` resta `"PC" | "PE"`.
- `src/lib/services/receipt-service.ts` — smettere di costruire
  `payments: [{ type, amount: totalAmount }]` e passare l'array normalizzato.
  **Attenzione:** `expectedTotalCents` usato dal recovery
  (`reconcileSaleBeforeResubmit`) resta il totale delle **righe**, non la somma
  dei pagamenti: con lo sconto a pagare i due valori divergono.
- `src/server/receipt-actions.ts` — stesso schema.
- UI cassa (`src/components/cassa/`) — il selettore diventa un ripartitore
  importi; mostrare sempre il residuo e bloccare l'invio finché non è zero
  (o non è assorbito dallo sconto a pagare, sub-task D).
- `refineLotteryCode` — vedi voce #13: il codice lotteria è ammesso **solo**
  quando `PE` è l'unico slot di pagamento non a zero. Col pagamento misto non è
  mai ammesso; con lo sconto a pagare sì (`scontoAbbuono` non conta).
- Aggiornare `DEVELOPER.md` e `src/app/(marketing)/help/api/page.tsx` (esempi
  di payload) — skill `marketing-content`.

### Sub-task D — sconto a pagare (`scontoAbbuono`)

Il più contenuto: `globalDiscount` esiste già nel DTO
(`SaleDocumentRequest.globalDiscount`) ed è già mappato su `scontoAbbuono`.
Serve solo esporlo.

- Schema: `globalDiscount` ≥ 0, ≤ totale righe, max 2 decimali.
- Vincolo di quadratura: già coperto dal `superRefine` del sub-task C.
- Persistenza in `publicRequest`; lettura in tutte le superfici del sub-task B
  (riga "Sconto a pagare" dopo il totale, come nel layout AdE della voce #8).
- **Analytics:** lo sconto a pagare **non** riduce il fatturato — il
  corrispettivo resta pieno (voce #3b). Riduce l'incassato. Se si mostra
  l'incassato, è una metrica nuova, non una correzione di quella esistente.
- UI: etichetta esplicita ("Sconto a pagare — non riduce l'IVA") per non
  confonderlo con lo sconto di riga.

### Sub-task E — sconto di riga (richiede A)

Il più invasivo: è l'unico che tocca il DB.

- **Migrazione** (skill `db-migrations`, regola 11 — handwritten):
  `commercial_document_lines` guadagna `unit_discount numeric(10,2) NOT NULL
DEFAULT 0`. `ADD COLUMN IF NOT EXISTS`, e schema Drizzle in
  `src/db/schema/commercial-document-lines.ts`.
- **Matematica condivisa:** `calcDocTotal`, `calcInputLinesTotalCents` e
  `computeReceiptTotals` in `src/lib/receipts/receipt-totals.ts` devono
  sottrarre lo sconto **prima** dello scorporo IVA, restando in centesimi
  interi per riga (regola 17). Questo modulo alimenta PDF, ricevuta pubblica,
  stampa termica, storico e analytics: cambiarlo qui li aggiorna tutti, ed è
  il motivo per cui non va duplicato altrove.
- `saleLineSchema` — `unitDiscount` ≥ 0, ≤ `grossUnitPrice`, max 2 decimali.
- UI carrello, PDF e stampa termica: colonna sconto (il layout AdE della voce
  #8 la mette dopo il prezzo).
- Test: il documento della voce #1 deve poter essere ricostruito end-to-end
  dalla cassa e produrre esattamente quel payload.

### Cosa NON serve fare

- **Il ramo annullo.** Voce #9: `mapVoidToAdePayload` rieccheggia il documento
  originale e non ha bisogno di sapere nulla di sconti o pagamenti.
- **Una migrazione per il pagamento misto o lo sconto a pagare.** Vivono in
  `publicRequest` (`jsonb`). Solo lo sconto di riga tocca il DB, perché le
  righe sono normalizzate in `commercial_document_lines`.

---

## 15. Cosa NON è stato misurato (limiti noti di questo registro)

Le voci #1-#13 sono misurate su payload reali accettati dall'AdE. Quanto
segue **non** lo è: sta qui perché un lettore futuro sappia dove finisce
l'evidenza e cominci l'inferenza, senza doverlo ri-scoprire da solo.

**`TR` e le tre `NR_*` non sono mai state osservate con importo > 0.** Di
loro sappiamo con certezza solo che gli slot sono **sempre presenti** nel
payload, a zero, e che `TR` porta il campo `numero` (`"0"`). La formula
`totaleNonRiscosso = NR_EF + NR_PS + NR_CS` (voce #4) viene da
`docs/api-spec.md`, non da una misura. Prima di **esporre** uno di questi
metodi serve un HAR dedicato: in particolare non sappiamo se un importo non
riscosso entri o no nella quadratura della voce #5 allo stesso modo di un
incasso. Per il pagamento misto `PC`+`PE` — l'unico in programma — questo non
è un ostacolo.

**Non sappiamo se l'AdE validi la quadratura lato server.** Il portale la
impone nel wizard, ma non abbiamo mai inviato un payload sbilanciato per
vedere cosa risponde. Corollario operativo: la quadratura è **responsabilità
nostra** (schema Zod + service, sub-task C). Non contare su un rifiuto AdE
come rete di sicurezza.

**Righe omaggio con aliquota IVA.** L'unico omaggio osservato (voce #7) è a
natura `N2`, quindi con `importoIVA = 0`. Non sappiamo se l'IVA di una riga
omaggio con aliquota entri in `importoTotaleIva`: sappiamo solo che la riga
concorre a `totaleImponibile` ed è esclusa da `ammontareComplessivo`. Irrilevante
finché `isGift` resta cablato a `false`; da chiarire prima di abilitare gli
omaggi.

**Documenti multi-aliquota con più righe scontate.** Non ce n'è un campione. I
totali di documento sono somme semplici delle righe (voce #4), quindi non c'è
un dubbio strutturale — ma un test end-to-end su un documento del genere è il
modo più economico per accorgersi di un errore di accumulo.

**La soglia di 1 euro della lotteria** — su quale importo si applichi: vedi la
nota in coda alla voce #13.
