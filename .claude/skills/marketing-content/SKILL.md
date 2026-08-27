---
name: marketing-content
description: Use when writing or editing marketing/SEO/GEO content or any user-facing copy that mentions plans or features, AND — just as importantly — when changing what a plan actually includes even without touching any copy: feature gating, plan labels, limits, trial terms in src/lib/plans.ts, or the server actions and dashboard pages that read it, because a gating change shipped without syncing the copy leaves a false promise on a public page. Files: the data files src/lib/help/articles.ts, src/lib/guide/articles.ts, src/lib/per/categories.ts, src/lib/confronto/comparisons.ts, src/lib/strumenti/tools.ts, pages under src/app/(marketing)/, components in src/components/marketing/ and src/components/help/, and plan/referral copy outside the marketing group (src/components/settings/referral-section.tsx). ALSO use when touching the technical SEO/GEO surface even with no copy involved: the robots/preview directives in src/app/layout.tsx metadata, the JSON-LD builders in src/components/json-ld.tsx, src/app/robots.ts, src/app/sitemap.ts, src/app/llms.txt and llms-full.txt, or the Cloudflare AI-crawler settings. Covers never promising unshipped features (conditional/roadmap wording, what is currently "in arrivo" on Pro), /help vs /guide slug separation to avoid canonical clashes, the grep checklist to sync copy after feature/label/gating changes, the permanent GEO checklist for AI-citable content (risposta secca in the first two lines, 134-167 word self-contained citable blocks front-loaded in the first 30% of the page, dated legal references, citable numbered facts), why FAQ content still matters although Google retired FAQ rich results on 7 May 2026, why /llms.txt is not a citation lever (Google Search ignores it) while blocked AI crawlers are a real incident, the max-snippet/max-image-preview preview directives as the only real control over Google's AI surfaces, AI Overviews vs AI Mode as two distinct citation engines, the content review cadence for freshness without faking dateModified, the anti-thin gate before adding a /per category (programmatic SEO, doorway-page risk), the SEO competitive positioning (depth + freshness + AI-citable answers, single /confronto landing), and LLM-generated content requiring human review (Italian, Italy-only target).
---

# marketing-content — contenuti marketing & SEO

## Dove vivono i contenuti (route → data file)

| Route               | Scopo                           | Data file                          |
| ------------------- | ------------------------------- | ---------------------------------- |
| `/help`             | operativo                       | `src/lib/help/articles.ts`         |
| `/guide`            | educativo                       | `src/lib/guide/articles.ts`        |
| `/per/[slug]`       | categorie esercenti             | `src/lib/per/categories.ts`        |
| `/confronto`        | comparazioni competitor         | `src/lib/confronto/comparisons.ts` |
| `/strumenti/[slug]` | tool gratuiti (backlink-magnet) | `src/lib/strumenti/tools.ts`       |

Copy che parla di piani/feature vive anche **fuori** dal gruppo
`(marketing)/`: `src/components/marketing/`, `src/components/help/` e
`src/components/settings/referral-section.tsx` (termini del bonus referral).

## Niente promesse di feature non live

In _nessun_ copy marketing una feature non implementata va scritta al
presente: condizionale/roadmap, mai "c'è". Stato attuale:

- Sul Pro resta "in arrivo" **solo** il recupero dei **documenti
  commerciali/corrispettivi da AdE** (roadmap v1.9.0).
- Il sync del **catalogo prodotti** da AdE **non** è più promesso
  (nice-to-have gated su domanda).
- Analytics avanzata ed Export CSV sono **spedite e Pro-gated**
  (commit ae1c481).
- I **due sconti del documento commerciale** sono **spediti e Pro-gated**
  (trial incluso), v1.7.4: lo **sconto di riga** (riduce base imponibile e
  IVA) e lo **sconto a pagare** (corrispettivo e IVA pieni, cala solo
  l'incassato). Sono grandezze fiscali diverse: non chiamarli entrambi
  "sconto" in un elenco di feature senza distinguerli. NON è ancora spedito
  l'arrotondamento DL 50/2017 con la sua voce di pagamento dedicata
  (`REVIEW.md` #96): non prometterlo.
- Il **messaggio di cortesia in fondo allo scontrino** è **spedito e
  Pro-gated** (trial incluso): max 64 caratteri su 2 righe, stampato su
  termica, PDF e ricevuta digitale, mai su una ricevuta di annullo. NON è
  personalizzazione di intestazione/logo, che resta nice-to-have in `PLAN.md`:
  non prometterla.

Se lo stato di una feature cambia (spedita, rimossa dalla roadmap), questo
elenco e la tabella Pricing in `CLAUDE.md` vanno aggiornati nello stesso PR.

Esempio del costo di questa regola violata: REVIEW.md #47 — la copy di
`/help` è rimasta Fisconline-only dopo che il login CIE è stato spedito in
v1.5.0, e il sito contraddiceva il prodotto.

### Feature che il marketing ha già promesso per sbaglio (non reintrodurle)

Sono capability **assenti dal prodotto** e classificate in `PLAN.md` sotto
"Nice to have (**no release**)". Un copy che le dà per fatte è un bug, non
un'esagerazione di marketing. Audit agosto 2026: erano finite in 8 punti fra
`/funzionalita`, `/per` e `/guide`.

- **Pagamento misto / ripartito** — `PaymentMethod` è `"PC" | "PE"`, uno per
  documento (`src/types/cassa.ts`, `src/lib/receipts/receipt-schema.ts`).
  Anche i **buoni pasto** sono nice-to-have: mai citarli fra i metodi.
  Le due voci si chiamano **Contanti** ed **Elettronico** (non "Carta": `PE`
  copre anche bonifico e app di pagamento, e sul documento la riga è
  `Pagamento elettronico`). "Carta" resta legittima come **parola della
  query** nei titoli e nel corpo — è così che l'utente cerca — mai come nome
  della voce in cassa. Grep di controllo: `carta` da solo pesca troppo
  (carta di credito, carta termica, prova senza carta, CIE), filtrare sul
  contesto del metodo di pagamento.
- **Codice fiscale del cliente / "scontrino parlante"** — `saleBodySchema`
  non ha il campo. Chi lo chiede va indirizzato al portale AdE o alla fattura.
- **Barcode scanner** — fuori roadmap per decisione esplicita.
- **Modalità offline / coda di trasmissione differita** — l'emissione senza
  rete fallisce e basta; non esiste retry differito lato client.

Prima di attribuire una capability al prodotto, verificala sullo schema o sul
componente, non sul copy vicino: le pagine `/help` sono risultate accurate
mentre `/per` e `/funzionalita` promettevano di più.

## Doppia scrittura vietata: date, prezzi, limiti di piano

Un dato che vive **sia** in un data file **sia** a mano nel JSX diverge, e
diverge in silenzio. Caso reale (audit agosto 2026): la riga visibile
"Ultimo aggiornamento" era hardcoded in ogni `page.tsx` di `/help` e si era
desincronizzata dal `dateModified` del registry su **19 articoli su 26** — il
testo diceva "aprile 2026", l'`Article` JSON-LD letto da Google e dalle AI
diceva luglio. Il freshness signal, cioè metà del vantaggio competitivo SEO,
era rotto senza che nessun test fallisse.

Fix strutturale: `HelpArticleUpdatedAt`
(`src/components/help/article-updated-at.tsx`) deriva la data da
`helpArticles[slug].dateModified`, stessa fonte del JSON-LD e della sitemap.
**Non reintrodurre date scritte a mano nel JSX.** Stessa regola per prezzi
(`src/components/marketing/pricing-section.tsx`) e limiti di piano
(`STARTER_CATALOG_LIMIT`, `TRIAL_DAYS` in `src/lib/plans-shared.ts`).

`formatUpdatedAt` formatta la stringa ISO **senza** `new Date()`: una
data-only è parsata come UTC ma renderizzata in locale, quindi nei fusi
negativi il giorno 01 slitta al mese precedente (e produce un mismatch di
idratazione).

## Riferimenti normativi: una sola versione in tutto il repo

Le date e le leggi citate vanno verificate su fonte esterna e devono essere
**identiche** in `/help`, `/guide` e `/per`. Un repo che si contraddice
perde la citabilità AI che è lo scopo della checklist GEO.

Riferimenti canonici oggi in uso (audit agosto 2026):

| Tema                        | Riferimento corretto                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collegamento POS 2026       | **L. 207/2024** (Bilancio 2025) art. 1 commi **74-77** + Provv. AdE **424470 del 31/10/2025**; servizio "Gestione Collegamenti" dal **5 marzo 2026**, prima comunicazione entro il **20 aprile 2026** |
| Sanzioni collegamento POS   | 1.000-4.000 € + sospensione 15 gg-2 mesi (art. 11 c. 5 D.Lgs. 471/1997); 100 €/operazione (art. 11 c. 2-quinquies)                                                                                    |
| Sanzioni corrispettivi      | **70%** dell'imposta, minimo **300 €** (art. 6 c. 2-bis D.Lgs. 471/1997 dopo il D.Lgs. 87/2024, dal 1° settembre 2024)                                                                                |
| Soglia forfettario 85.000 € | L. 197/2022 (Bilancio 2023) — **non** confonderla con la norma POS                                                                                                                                    |
| Lotteria scontrini          | solo pagamenti **elettronici** sopra 1 €, 1 biglietto/euro fino a 1.000; estrazioni settimanali 25.000 €, mensili 100.000 €, annuale 5 mln; **istantanea mai avviata**                                |
| Garanzia legale             | **24 mesi** dalla consegna (art. 133 D.Lgs. 206/2005) — 26 mesi è la prescrizione dell'azione, non la durata                                                                                          |

**Ogni riga di questa tabella ha una data di verifica implicita** (l'audit
citato sopra). Una norma citata senza che nessuno l'abbia riletta dopo un cambio
di legge è peggio di una norma assente: è una citazione sbagliata che un'AI
ripeterà con la nostra firma sopra.

Trappola vista sul campo: la guida `/guide/pos-rt-obbligo-2026` citava
"L. 197/2022 art. 1 c. 74" mentre `/help/normativa-pos-2026` citava
correttamente L. 207/2024 — stesso numero di comma, legge diversa, plausibile
a occhio. Quando due pagine dello stesso repo divergono su una norma,
**verifica esternamente**, non scegliere la più recente.

## Slug separati /help vs /guide (canonical clash)

Sulle keyword condivise usare slug **diversi** per evitare canonical clash:
es. `/help/regime-forfettario` ≠ `/guide/regime-forfettario-scontrini`;
le due pagine si linkano a vicenda.

## Checklist sync copy dopo un cambio funzionalità

Se modifichi una funzionalità (label, menu, stati, filtri, error flow,
gating piani, nomi bottoni, termini del bonus referral) **prima di chiudere
il task**:

```bash
grep -rn "<termine>" 'src/app/(marketing)' src/components/marketing src/components/help src/components/settings/referral-section.tsx
```

e aggiorna ogni occorrenza stale nei data file / componenti sopra.

## Checklist GEO (per ogni contenuto nuovo o aggiornato)

I due canali a budget zero sono **ricerca organica Google** e **risposte AI**
(ChatGPT, Perplexity, Google AI Overviews). Per farsi citare dalle AI, ogni
guida/help/tool nuovo o revisionato rispetta:

1. **Risposta secca nelle prime 2 righe** di ogni pagina e di ogni sezione: le
   AI citano il paragrafo che _risponde_, non quello che introduce. Vale anche
   per ogni FAQ (la risposta apre col fatto, non col contesto).

   Due misure rendono la regola verificabile invece che estetica. Il blocco
   citabile sta fra le **134 e le 167 parole** e **si regge da solo**: estratto
   dalla pagina resta vero e comprensibile senza il contesto intorno — se per
   capirlo serve il paragrafo precedente, non è citabile. E il **primo 30%
   della pagina** raccoglie circa il **44%** delle citazioni AI: la risposta
   migliore non sta in fondo dopo la spiegazione. Se un H2 ha bisogno di tre
   paragrafi di preambolo prima di rispondere, è sbagliato l'ordine, non la
   lunghezza.

2. **Riferimenti normativi espliciti e datati** (es. "art. 1, commi 54-89, L.
   190/2014", "dal 1° gennaio 2021"). La data si muove quando il contenuto
   cambia davvero, non a ogni passaggio: vedi "Cadenza di revisione" sotto.
3. **FAQ a video su ogni pagina, minimo 2.** Il valore sta nel contenuto, non
   nel markup: i rich result FAQ di Google sono stati **ritirati per tutti i
   siti il 7 maggio 2026** (filtro e report in Search Console rimossi a
   giugno, dati API ad agosto). `faqPageJsonLd` resta cablato in
   `src/components/json-ld.tsx` e le pagine che ce l'hanno se lo tengono —
   structured data non consumato non penalizza, e i consumer non-Google
   restano — ma **non aggiungere FAQPage a una pagina sperando in un rich
   result**. Quello che paga è la forma: domanda scritta come la formula
   l'utente, risposta che apre col fatto.
4. **Fatti citabili con numeri** ("sanzione del 90%", "bollo 2,00 € oltre
   77,47 €"): le AI preferiscono claim verificabili.
5. **Slug separati `/help` vs `/guide`** sulle keyword condivise (vedi sopra):
   help = operativo in-app, guide = educativo/reference. I `metaTitle` devono
   riflettere intent distinti per non cannibalizzarsi.
6. **`metaTitle` ≤ 60 caratteri.** Guide e articoli help dichiarano un title
   **assoluto** (`{ absolute: … }` in `guide/[slug]/page.tsx` e
   `lib/help/metadata.ts`): bypassa il template root `"%s | ScontrinoZero"`,
   che aggiungerebbe 16 caratteri e farebbe troncare la coda della keyword
   senza nemmeno mostrare il brand — visibile comunque via site name
   (`webSiteJsonLd`) e breadcrumb del dominio. L'invariante è testata nei due
   registry; le pagine hub continuano a usare il template.
7. **Il titolo riprende le parole della query e anticipa la risposta.** Non
   "Registratore di cassa: prezzi e alternative" ma "Quanto costa un
   registratore di cassa: 400-800 € + canone". Su GSC 2026-08 le pagine col
   titolo che non riprende la query stavano a CTR 0,36-0,99% da posizione
   9-10, cioè un ordine di grandezza sotto la norma per quelle posizioni.

## Cadenza di revisione: la freschezza è metà del vantaggio

La profondità la costruisci una volta, la freschezza la perdi da sola. Un
contenuto sotto i **3 mesi** ha circa **3x** di probabilità di essere citato in
una risposta AI; oltre i **6 mesi** senza revisione l'eleggibilità cala
sensibilmente. Siccome "profondità + freschezza" è il vantaggio competitivo che
questa skill dichiara più sotto, la cadenza è parte della strategia, non
manutenzione:

| Superficie                               | Revisione                                         |
| ---------------------------------------- | ------------------------------------------------- |
| `/guide` e `/help` su norme con scadenze | trimestrale, e **subito** a ogni cambio normativo |
| `/confronto` (pricing competitor)        | trimestrale                                       |
| `/per` e `/strumenti`                    | semestrale                                        |
| Resto del marketing                      | annuale                                           |

**Il vincolo che rende la regola onesta:** Google elenca esplicitamente fra i
campanelli d'allarme dei contenuti non-helpful il _fingere_ freschezza e il
churn di massa per simulare aggiornamenti. Quindi `dateModified` si muove **solo
se il contenuto è cambiato davvero**. Una revisione che non trova nulla da
correggere lascia la data dov'è: non è un fallimento, è il caso normale su una
pagina scritta bene. Ritoccare la data a vuoto non è un trucco che non
funziona, è un segnale negativo che ci paghiamo.

## Due motori di citazione Google, non uno

AI Overviews e AI Mode arrivano alla stessa conclusione circa l'**86%** delle
volte ma citano gli stessi URL solo il **13,7%**: sono due bacini distinti, non
la stessa feature con due nomi.

- **AI Overviews** è fortemente correlato al ranking classico: ci si arriva
  posizionandosi. Nient'altro da fare oltre alla SEO che già facciamo.
- **AI Mode** pesca da un bacino più largo (~9 domini citati per query) dove
  **freschezza ed entity authority pesano più della posizione grezza**.

È la distinzione che ci riguarda di più: su GSC 2026-08 stiamo a posizione 9-10
su parecchie query, cioè fuori dai giochi per AI Overviews ma **dentro** il
bacino di AI Mode. La cadenza di revisione qui sopra è la leva che agisce su
quel canale senza dover prima scalare la SERP.

Nessuna delle due si governa dai controlli sui crawler AI: quali crawler
toccano quali superfici sta più sotto, in "Verificare robots.txt **servito**".

## Verificare robots.txt **servito**, non quello nel repo

`src/app/robots.ts` non è l'ultima parola: Cloudflare può iniettare un blocco
_Managed robots.txt_ a livello di zona che viene anteposto all'output
dell'app, e nessuna modifica al repo lo scavalca. Ad agosto 2026 quel blocco
vietava `ClaudeBot`, `GPTBot`, `Google-Extended`, `CCBot`, `Amazonbot`,
`Applebot-Extended`, `Bytespider` e `meta-externalagent`. Il danno non era su
`/llms.txt`: era che **metà dei crawler AI non poteva leggere nessuna pagina
del sito**, cioè l'intera checklist GEO qui sopra lavorava a vuoto per quei
motori. Scoperto solo curlando la produzione.

Quindi, ogni volta che si tocca GEO o si dà per acquisita la citabilità AI:

```bash
curl -sS https://scontrinozero.it/robots.txt          # cosa esce davvero
curl -sS -o /dev/null -w '%{http_code}\n' \
  -A 'ClaudeBot/1.0 (+https://www.anthropic.com/claude-bot)' \
  https://scontrinozero.it/llms-full.txt              # 200, non 403
```

Il secondo comando serve perché il blocco WAF dei bot AI è un interruttore
**separato** dal managed robots.txt: spegnerne uno non spegne l'altro, e
l'enforcement WAF risponde 403 invece di un `Disallow`.

**Terzo interruttore della stessa famiglia: AI Labyrinth.** I Security
Insights di Cloudflare lo propongono periodicamente ("Review unwanted AI
crawlers with AI Labyrinth") su entrambe le zone. Sul dominio marketing la
risposta è **no, sempre**: serve a servire contenuto-esca ai crawler AI, cioè
a rompere di proposito il canale che `/llms.txt`, `/llms-full.txt` e tutta la
checklist GEO qui sotto esistono per alimentare. Un "suggerimento di
configurazione" della dashboard non è una decisione di prodotto. Razionale
completo e trigger di riapertura: `REVIEW.md`, "Rischi accettati".

Al 2026-08-26 il canale è sano — il blocco managed robots.txt non c'è più
(`/robots.txt` servito = quello dell'app) e `ClaudeBot` riceve `200` su
`/llms-full.txt`: sono i due comandi qui sopra, ed è così che deve restare.

Distinzioni da non confondere quando si valuta l'impatto: `Google-Extended`
governa Gemini e il grounding Vertex, **non** le AI Overviews né AI Mode (che
dipendono entrambe da Googlebot); le citazioni in ChatGPT search passano da
`OAI-SearchBot`, non da `GPTBot`, che copre il training.

### `/llms.txt` non è una leva di citazione — teniamolo, non contiamoci

Google dichiara **nei propri doc** che Search ignora `llms.txt` e gli altri file
AI-specifici: non aiutano e non danneggiano ranking o visibilità. Le evidenze
esterne convergono — Mueller lo ha definito "a dead end" e ha detto che nessun
sistema AI lo usa oggi, Illyes che Google non ha piani di supportarlo, uno
studio SE Ranking su 300k domini ha trovato che fra i 50 domini più citati dalle
AI **uno solo** aveva un `/llms.txt`, e un audit di server log ha misurato lo
**0,1%** del traffico bot AI diretto a quel path.

Quindi: i due file restano (costano zero, e `llms.txt` è realmente consumato
dagli **agent di coding** quando leggono la documentazione di una libreria —
che per la nostra Developer API è un consumer vero), ma **non vanno contati come
canale di citazione** e non giustificano lavoro dedicato. Il `curl` con
`ClaudeBot` qui sopra serve a verificare che il _sito_ sia raggiungibile: che
punti a `/llms-full.txt` è un dettaglio del test, non il suo scopo.

### Direttive preview: l'unico controllo reale sulle superfici AI di Google

Non esiste un opt-in/opt-out dedicato per AI Overviews e AI Mode. Comparsa e
**lunghezza del passaggio citato** sono governate dalle direttive preview
standard — `max-snippet`, `max-image-preview`, `max-video-preview`, più
`nosnippet` / `data-nosnippet` per escludere. Sono le stesse che governano gli
snippet classici.

Il root layout (`src/app/layout.tsx`) dichiara `max-snippet: -1`,
`max-image-preview: "large"` e `max-video-preview: -1` proprio per non far
tagliare da Google la risposta secca che la checklist GEO esiste per costruire.
L'invariante è testata in `src/app/layout.test.tsx`. Se una pagina deve
sottrarsi a una superficie AI, la leva è `nosnippet` su quella pagina, **non**
un file o un meta tag "AI": non esistono.

## `/per`: il gate anti-thin sulle pagine da template

`/per/[slug]` genera 22 pagine da **un solo template**, riempito con
`audience`, `useCase`, `obligations`, `benefits`, `faq` e `relatedHelp` presi da
`src/lib/per/categories.ts`. È programmatic SEO, e la policy Google sulle
doorway page e sui contenuti scalati colpisce esattamente il caso "cambia il
nome della categoria, il resto è identico".

Prima di aggiungere una categoria, due gate:

1. **Il test del valore autonomo.** Questa pagina meriterebbe di esistere se non
   avesse 21 sorelle? Se la risposta si regge solo su "copre un'altra keyword",
   è una doorway page.
2. **Differenziazione reale.** `obligations` e `faq` sono i campi che devono
   divergere davvero: un ambulante e un B&B hanno obblighi fiscali diversi, non
   lo stesso obbligo con un sostantivo scambiato. Se per una categoria nuova
   questi campi sono la parafrasi di una categoria esistente, la mossa giusta è
   **estendere la pagina esistente**, non aggiungerne una.

Il rischio non è teorico ed è asimmetrico: all'audit di agosto 2026 `/help` è
risultato accurato, `/per` e `/funzionalita` no. `/per` è la superficie che
deriva per prima, perché il template rende cheap l'aggiunta e invisibile la
diluizione. Stessa logica per `/strumenti/[slug]`, che però parte avvantaggiato:
ogni tool fa qualcosa di diverso, quindi il valore autonomo sta nella
funzionalità, non nel copy.

## Vantaggio competitivo SEO

Il differenziatore vs competitor è **profondità + freschezza + risposte secche
citabili dalle AI** (guide editoriali, `Article` per il freshness signal; la FAQ
vale come contenuto, non come schema — vedi il punto 3 della checklist). Da giocare:
verticali di settore, pagina stampanti, credenziali via SPID. Decisione presa:
**niente pagine confronto per-competitor** — resta la landing unica
`/confronto` (`src/lib/confronto/comparisons.ts`), da aggiornare
trimestralmente perché i pricing dei competitor cambiano.

## Produzione contenuti

Contenuti generati via LLM con **review umana**, in italiano, target Italia.
