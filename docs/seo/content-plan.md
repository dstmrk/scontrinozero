# Piano contenuti SEO + visibilità AI (GEO)

> Documento vivo. Creato a luglio 2026 dall'analisi GSC (3 mesi) + competitor.
> Spuntare il backlog man
> mano che i batch vengono spediti. Regola 8 di `CLAUDE.md` sempre valida:
> contenuti in italiano, niente promesse di feature non live, review umana.

## Obiettivo

Zero budget marketing → i canali sono due: **ricerca organica Google** e
**risposte AI** (ChatGPT, Perplexity, Google AI Overviews). Il sito ha già
una base tecnica SEO ottima (JSON-LD completo, sitemap auto-generata,
canonical, OG image): il lavoro è su **copertura dei contenuti, CTR e
accessibilità ai crawler AI**.

## Diagnosi GSC (aprile–luglio 2026)

**Totali:** 64 clic / 2.554 impressioni / CTR 2,9% / posizione media ~20.
Impressioni in forte crescita (da ~5/giorno a maggio a ~80-100/giorno a
luglio). Tutto il traffico utile è dall'Italia.

**Cluster di query (impressioni aggregate → posizione media):**

| Cluster                                                                  | Impr. ~ | Pos.   | Stato                                                                                                           |
| ------------------------------------------------------------------------ | ------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Codice IVA / N2.2 / dicitura forfettario (50+ query long-tail)           | ~250    | 25–95  | `/help/regime-forfettario` 540 impr, pos 28,9, CTR 0,37%; `/guide/codici-natura-iva` fresca (29/06) sta salendo |
| "Scontrino senza (registratore di) cassa / online / app" — transazionale | ~250    | 38–55  | Homepage + `/guide/scontrino-senza-registratore-di-cassa` deboli; è LA keyword commerciale                      |
| Scontrino forfettario ("scontrino elettronico forfettari/parrucchieri…") | ~120    | 10–25  | `/guide/scontrino-regime-forfettario` pos 7,35 ma CTR 1,64%                                                     |
| Annullare/stornare scontrino                                             | ~180    | 11–45  | `/help/annullare-scontrino` pos 11,68; angolo "entro quanto tempo" non coperto nel title                        |
| POS 2026 (normativa, scadenza aprile, obbligo)                           | ~60     | 3–31   | Forte (pos 8,4); "scadenza collegamento pos aprile 2026" (17 impr) non intercettata esplicitamente              |
| Scorporo IVA / calcolo da lordo                                          | ~40     | 72–100 | `/strumenti/scorporo-iva` non competitivo (SERP di calcolatori affermati)                                       |
| Errori di accesso AdE                                                    | 111     | 6,6    | `/help/errori-ade` **CTR 0%** nonostante pos 6,6 → title non matcha l'intent (password scaduta/bloccata)        |
| Numero azzeramento scontrino                                             | ~10     | 71–81  | Nessuna pagina dedicata                                                                                         |

## Competitor (snapshot luglio 2026)

| Competitor                       | Pricing                                         | Punti di forza contenuti                                                                                                    |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Scontrina (scontrina.it)         | 8,19 €/mese o 65,57 €/anno (promo 1 € x 3 mesi) | FAQ ricca, pagine verticali (ricettive, mobilità), KB esterna, app store                                                    |
| CassaDigitale (cassadigitale.eu) | 4,99 €/mese                                     | **Blog verticale per settore** (palestre, B&B, eventi/festival, NCC/food truck, parrucchieri/tatuatori), social proof forte |
| Billy (scontrinosenzacassa.it)   | ~70 €/anno                                      | Exact-match domain sulla keyword principale; pagine stampanti, credenziali Fisconline via SPID, integrazioni POS            |
| Scontrinare (scontrinare.it)     | 30 €/anno                                       | Guida strutturata (videoguide, credenziali, stampa, FAQ)                                                                    |

Nessuno ha guide editoriali profonde con schema Article/FAQPage come le
nostre: il vantaggio da giocare è **profondità + freschezza + risposte
secche citabili dalle AI**. Da copiare: verticali di settore
(CassaDigitale), pagina stampanti (tutti), credenziali via SPID
(Billy/Scontrinare). Decisione presa: **niente pagine confronto
per-competitor**, resta la landing unica `/confronto` (da aggiornare
trimestralmente: i pricing cambiano, Scontrina ha promo in corso).

## Fase 1 — Quick win (spediti con questo documento)

- [x] Riscrittura meta title/description CTR-driven per le pagine ad alto
      volume di impressioni: `help/regime-forfettario`, `help/errori-ade`,
      `help/annullare-scontrino`, `help/normativa-pos-2026`,
      `guide/scontrino-regime-forfettario`,
      `guide/scontrino-senza-registratore-di-cassa` (data file
      `src/lib/help/articles.ts` e `src/lib/guide/articles.ts`).
- [x] Route `/llms.txt` (`src/app/llms.txt/route.ts`): indice del sito per i
      crawler AI generato dagli stessi registry della sitemap (niente drift),
      servito solo sull'apex marketing.
- [ ] Azioni Cloudflare della sezione sopra (manuali, dashboard).

## Fase 2 — Backlog contenuti (1 batch = 1 PR, max 3 contenuti)

### Batch A — P1: cluster forfettario/N2.2 (il più grande asset non sfruttato)

- [x] **Nuovo strumento `/strumenti/dicitura-regime-forfettario`**:
      generatore copia-incolla della dicitura di esenzione (scontrino vs
      fattura) con FAQ. Intercetta "dicitura scontrino regime forfettario",
      "regime forfettario esente iva dicitura", "operazione senza
      applicazione dell'IVA art. 1 co. 54-89" (long-tail a bassissima
      competizione). Solo data file + widget semplice.
- [x] **Potenziare `/guide/codici-natura-iva`**: tabella N1→N7 completa, una
      sezione per forma di query ("n2.2 cosa significa", "n2 vs n2.2",
      "codice iva n2.2 a cosa corrisponde"), risposta secca nel primo
      paragrafo di ogni sezione.
- [x] **Cross-link sistematico del cluster**: `help/regime-forfettario` ↔
      `guide/codici-natura-iva` ↔ `guide/scontrino-regime-forfettario` ↔
      nuovo strumento dicitura.

### Batch B — P1: cluster transazionale "senza cassa / app / online"

- [ ] **Potenziare `/guide/scontrino-senza-registratore-di-cassa`**: sezione
      "quale app scegliere" (query "app scontrino elettronico senza
      registratore di cassa", "scontrino online"), sezione costi, risposta
      secca in apertura.
- [ ] **Homepage**: rafforzare H1/primo paragrafo sull'intent "senza
      registratore di cassa" + link in evidenza alla guida (oggi la homepage
      rankea da sola a pos 40-50 su queste query).

### Batch C — P2: verticali `/per/` (dove i competitor investono)

Nuove categorie in `src/lib/per/categories.ts` (solo data file), in ordine:

- [ ] officine e meccanici (query "scontrino elettronico officina meccanica"
      già in GSC)
- [ ] eventi, mercatini e hobbisti
- [ ] palestre e personal trainer
- [ ] food truck e street food
- [ ] NCC e taxi
- [ ] tatuatori e piercer (oggi solo accennati in parrucchieri-estetisti)

### Batch D — P2: gap operativi (visti nei competitor e in GSC)

- [ ] **Guida "Stampanti termiche WiFi per scontrino: guida alla
      scelta"** (tutti i competitor hanno la pagina stampanti; intent
      commerciale). Solo hardware generico compatibile, nessuna promessa di
      feature.
- [ ] **Help "Numero documento e azzeramento sullo scontrino"** (query a pos
      71-81 senza pagina; richiede `page.tsx` JSX oltre al registry).

### Batch E — P3

- [ ] `/strumenti/scorporo-iva`: aggiungere calcolo inverso (aggiungi IVA) e
      più contenuto — SERP difficile, aspettative basse.
- [ ] Manifest PWA: `lang`, `id`, `screenshots`, `shortcuts` (install prompt
      ricco su Android/desktop).

## Fase 3 — Checklist GEO permanente (per ogni contenuto nuovo o aggiornato)

1. **Risposta secca nelle prime 2 righe** di ogni guida e di ogni sezione:
   le AI citano il paragrafo che risponde, non quello che introduce.
2. Riferimenti normativi espliciti e datati (già punto di forza) e
   `updatedAt` reale a ogni revisione.
3. FAQ a video su ogni pagina → FAQPage schema automatico (già cablato via
   `faqPageJsonLd`).
4. Fatti citabili con numeri ("dal 1° gennaio 2021", "sanzione del 90%…"):
   le AI preferiscono claim verificabili.
5. Slug separati `/help` vs `/guide` sulle keyword condivise (regola 8):
   help = operativo in-app, guide = educativo/reference. I metaTitle devono
   riflettere intent distinti per non cannibalizzarsi.
