# Strategia corrispettivi 2027 — soluzioni software (PEM/PEL)

**Stato al 16 settembre 2026.** Nota di scenario, non un piano: nessuna
decisione presa, nessuna release pianificata. Serve a non rifare la ricerca
fra sei mesi e a riconoscere i trigger quando arrivano.

---

## 1. Il quadro normativo

| Fonte                                          | Cosa fa                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Art. 2 D.Lgs. 127/2015                         | Obbligo di memorizzazione e trasmissione telematica dei corrispettivi       |
| Provv. AdE 182017 del 28/10/2016               | Istituisce la procedura web "Documento Commerciale Online" — mai abrogato   |
| Art. 24 D.Lgs. 1/2024 (Adempimenti)            | Ammette l'adempimento anche tramite "soluzioni software" (art. 2 c. 3)      |
| Provv. AdE 111204 del 07/03/2025               | Regole tecniche PEM/PEL, ruoli, iter di approvazione                        |
| Specifiche tecniche soluzione software         | v1.0 (feb 2025) → v1.1 → v1.2 (dic 2025) → **v1.4** (corrente)              |
| L. 207/2024 + Provv. AdE 424470 del 31/10/2025 | Collegamento POS–RT dal 01/01/2026; registrazione a portale dal 05/03/2026  |
| D.Lgs. 148/2026 ("Omnibus"), art. 33           | Tolleranza del 5% sul disallineamento pagamenti elettronici / corrispettivi |

### Tre fatti che reggono tutto il resto

**1. La procedura web non ha una data di dismissione.** Non esiste norma né
provvedimento che la sopprima, e il Provv. 182017/2016 che la istituisce è
in vigore. Segnale più forte di qualsiasi dichiarazione: per il collegamento
POS l'AdE ha aperto dal 5 marzo 2026 un percorso di registrazione **dedicato
a chi usa il documento commerciale online**. Non si costruisce un adempimento
nuovo sopra una procedura che si vuole spegnere.

**2. Le soluzioni software sono una quarta opzione, non un sostituto.** Al
tavolo AdE–Sogei–AssoSoftware del 27 maggio 2026 la roadmap è stata
confermata: operatività nel **2027**, nessun obbligo di migrazione, procedura
web e registratori telematici che restano. Le quattro strade diventano RT
fisico, procedura web, RT con tecnologia BLOB, soluzione software certificata.

**3. Le specifiche sono un bersaglio mobile.** Quattro versioni in diciotto
mesi. Chi ci costruisce sopra oggi insegue uno standard che si muove ancora —
e infatti restano aperti i tempi di certificazione, la ripartizione delle
responsabilità sui malfunzionamenti e le specifiche del collegamento ai
pagamenti elettronici.

Nota di contesto: l'art. 33 del D.Lgs. 148/2026 richiama espressamente
_«l'articolo 2, comma 3, del decreto legislativo 5 agosto 2015, n. 127»_,
cioè la norma sulle soluzioni software. Il legislatore sta già scrivendo il
regime sanzionatorio di un mondo che considera destinato a esistere.

---

## 2. Com'è fatta una soluzione software

Due moduli software interdipendenti, entrambi da approvare.

- **PEM — Punto di Emissione (Modulo Fiscale 1).** Sta sul punto cassa. Il
  dispositivo può essere **fisico o virtuale**: tablet, smartPOS, PC, VM
  cloud. Registra i dati dell'operazione, genera il documento commerciale,
  applica il sigillo elettronico con il **certificato del dispositivo**,
  gestisce la lotteria. **Non parla mai direttamente con l'AdE.**
- **PEL — Punto di Elaborazione (Modulo Fiscale 2).** Server locale o cloud.
  Memorizza i dati fiscali delle singole operazioni, produce e trasmette
  l'XML riepilogativo giornaliero, dialoga con l'AdE via API REST. **È l'unico
  interlocutore dei sistemi dell'Agenzia.**

Ogni PEM ha una matricola assegnata dall'Erogatore e un certificato proprio,
richiesto con una CSR che porta la matricola nel Common Name. L'esercente
censisce i suoi PEM sul portale Fatture e Corrispettivi.

### I tre ruoli

| Ruolo          | Cosa fa                                                        | Cosa serve per esserlo                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Produttore** | Sviluppa MF1/MF2 e li mantiene aggiornati                      | Certificazione presso ente certificatore accreditato (università o centri di ricerca), parere della Commissione per l'approvazione dei misuratori fiscali, **provvedimento di approvazione del Direttore AdE**, ISO 9001 + ISO 27001, ricertificazione a ogni variante fiscalmente rilevante pena la revoca |
| **Erogatore**  | Gestisce il PEL, distribuisce la soluzione, assiste, trasmette | **Accreditamento al sistema AdE**, uso di una soluzione presente nell'elenco delle approvate, ISO 9001 + ISO 27001, certificati SSL e di firma                                                                                                                                                              |
| **Esercente**  | Usa la soluzione                                               | Censimento dei PEM, certificato per dispositivo                                                                                                                                                                                                                                                             |

Le istanze si presentano via PEC a `misuratorifiscali@pec.agenziaentrate.it`.
La Commissione si riunisce **quattro volte l'anno** (nel 2026: 19 febbraio,
23 aprile, 8 luglio, 14 ottobre): è il collo di bottiglia di calendario.

AdE pubblica tre elenchi da tenere d'occhio: soluzioni approvate, erogatori
accreditati, enti certificatori.

---

## 3. Le opzioni

### A — Integrazione con PEM/PEL di terzi

ScontrinoZero resta il front-end che l'esercente usa; modulo fiscale e
trasmissione stanno a un soggetto già approvato. Tre gradazioni, dalla meno
alla più impegnativa:

| #   | Modello         | Cosa comporta                                                                                                  | Requisiti formali su di noi               |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | **Rivenditore** | Si rivende la soluzione di chi è insieme Produttore ed Erogatore                                               | Nessuno                                   |
| 2   | **Integratore** | Si incorpora l'MF1 del Produttore nell'app, il suo PEL trasmette; restiamo padroni di cassa, catalogo, storico | Nessuno                                   |
| 3   | **Erogatore**   | Gestiamo noi il PEL su soluzione altrui: più controllo e margine                                               | Accreditamento AdE + ISO 9001 + ISO 27001 |

**Costi.** (1) e (2) non hanno costi di certificazione, ma comprimono il
margine e creano dipendenza da un fornitore. (3) elimina laboratorio e
Commissione ma non le due ISO: sono certificazioni d'organizzazione (sistema
di gestione documentato, audit stage 1 e 2, sorveglianza annuale), stimabili
in **€15.000–40.000 il primo anno** più il mantenimento. Stima, non
preventivo: non esistono tariffari pubblici per gli enti certificatori.

**Fare il Produttore in proprio è fuori discussione** a costi fissi ~€0: oltre
alle ISO, l'approvazione compra un obbligo permanente di ricertificazione a
ogni variante fiscalmente rilevante. È l'opposto del principio "hobby
project, costi fissi ~€0".

### B — Runtime nativo sul dispositivo dell'esercente

L'app nativa iOS/Android già in valutazione in `PLAN.md` (v2.0). Sposta
l'esecuzione del flusso AdE dal server al dispositivo dell'esercente, e
sblocca le due capability oggi precluse alla PWA:

- **SPID** — il flusso IdP vive in una webview e richiede di persistere il
  cookie di sessione.
- **Stampa Bluetooth su iOS** — WebKit non implementa Web Bluetooth e non c'è
  flag che lo abiliti. Su Android la PWA la spedisce già dalla v1.6.0.

Dal browser della PWA non è una scorciatoia percorribile: CORS blocca le
chiamate dirette al dominio AdE. Serve davvero il runtime nativo.

**Costo:** un secondo runtime da mantenere, contro il principio "dipendenze
minime, un solo container". Non si improvvisa in un trimestre.

### A + B

Non sono alternative: **B** è un investimento sul canale attuale (procedura
web), **A** è il ponte verso il regime 2027. Si possono fare in sequenza — B
prima, A quando il mercato degli erogatori è maturo — o si può saltare B e
andare dritti ad A accettando di restare sull'architettura corrente fino a
che il partner non è operativo.

---

## 4. Criteri di decisione

Il bivio è: l'architettura centralizzata è **da sistemare** (→ B) o **da
abbandonare** (→ A)?

**Verso A**, se entro un paio di mesi almeno un Produttore conferma che
espone l'MF1 a terzi a condizioni sostenibili per volumi piccoli. È la strada
dove va la legge, e chiude il tema invece di gestirlo.

**Verso B**, se quella conferma non arriva. Diventa il piano obbligato, e
conviene saperlo presto.

### Domande da fare a un potenziale partner

1. Siete Produttore, Erogatore o entrambi?
2. A che punto è l'iter di approvazione? Siete negli elenchi AdE?
3. Esponete l'MF1 a integratori terzi, o solo la soluzione completa?
4. Che modello economico per un partner con volumi piccoli — fisso, per PEM
   censito, per documento trasmesso?
5. Chi risponde all'esercente in caso di malfunzionamento del modulo fiscale?

---

## 5. Cosa monitorare

- I tre elenchi AdE (soluzioni approvate, erogatori, enti certificatori):
  finché sono vuoti o quasi, l'opzione A non è eseguibile.
- Le versioni delle specifiche tecniche: oggi v1.4.
- Gli esiti delle sedute della Commissione misuratori fiscali.
- Legge di Bilancio e provvedimenti AdE sui requisiti dei software che
  trasmettono corrispettivi.
- Il collegamento POS: chi usa la procedura web deve registrarlo **di
  persona**, senza intermediari. È materia di supporto e di contenuto.

---

## 6. Fonti

Testi normativi verificati sul testo integrale (settembre 2026):

- **D.Lgs. 7 agosto 2026 n. 148**, GU Serie Generale n. 185 dell'11/08/2026,
  Suppl. Ord. n. 30, in vigore dal 12/08/2026 — 37 articoli. Gli unici che
  toccano la materia sono l'art. 33 (tolleranza 5%, modifica artt. 11 c.
  2-quinquies e 12 c. 2 del D.Lgs. 471/1997 e artt. 36 c. 6 e 37 c. 3 del
  D.Lgs. 173/2024) e l'art. 31 (uso dei file delle fatture elettroniche per
  analisi del rischio).
- **Provvedimento AdE prot. n. 111204 del 07/03/2025** e allegate specifiche
  tecniche.
- **Risposta a interpello AdE n. 413 del 25 settembre 2020** — condizioni per
  i software che automatizzano la procedura web: unità e contestualità
  dell'adempimento, impossibilità di alterare i dati trasmessi o quanto
  generato in risposta.

Rassegna di stampa specializzata (maggio–agosto 2026) sulla roadmap 2027 e
sul dibattito di categoria: reperibile cercando "corrispettivi soluzioni
software 2027" e "roadmap AdE Sogei AssoSoftware".
