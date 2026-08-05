---
name: marketing-content
description: Use when writing or editing marketing/SEO/GEO content or any user-facing copy that mentions plans or features — the data files src/lib/help/articles.ts, src/lib/guide/articles.ts, src/lib/per/categories.ts, src/lib/confronto/comparisons.ts, src/lib/strumenti/tools.ts, pages under src/app/(marketing)/, components in src/components/marketing/ and src/components/help/, and plan/referral copy outside the marketing group (src/components/settings/referral-section.tsx). Covers never promising unshipped features (conditional/roadmap wording, what is currently "in arrivo" on Pro), /help vs /guide slug separation to avoid canonical clashes, the grep checklist to sync copy after feature/label/gating changes, the permanent GEO checklist for AI-citable content (risposta secca in the first two lines, dated legal references, FAQPage, citable numbered facts), the SEO competitive positioning (depth + freshness + AI-citable answers, single /confronto landing), and LLM-generated content requiring human review (Italian, Italy-only target).
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
2. **Riferimenti normativi espliciti e datati** (es. "art. 1, commi 54-89, L.
   190/2014", "dal 1° gennaio 2021") e `updatedAt` reale a ogni revisione.
3. **FAQ a video su ogni pagina** → FAQPage schema automatico (già cablato via
   `faqPageJsonLd` in `src/components/json-ld.tsx`). Minimo 2 FAQ.
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

## Verificare robots.txt **servito**, non quello nel repo

`src/app/robots.ts` non è l'ultima parola: Cloudflare può iniettare un blocco
_Managed robots.txt_ a livello di zona che viene anteposto all'output
dell'app, e nessuna modifica al repo lo scavalca. Ad agosto 2026 quel blocco
vietava `ClaudeBot`, `GPTBot`, `Google-Extended`, `CCBot`, `Amazonbot`,
`Applebot-Extended`, `Bytespider` e `meta-externalagent`: `/llms.txt` e
`/llms-full.txt`, costruiti apposta per i crawler AI, erano irraggiungibili
da metà dei crawler a cui parlano. Scoperto solo curlando la produzione.

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

Distinzioni da non confondere quando si valuta l'impatto: `Google-Extended`
governa Gemini e il grounding Vertex, **non** le AI Overviews di Google (che
dipendono da Googlebot); le citazioni in ChatGPT search passano da
`OAI-SearchBot`, non da `GPTBot`, che copre il training.

## Vantaggio competitivo SEO

Il differenziatore vs competitor è **profondità + freschezza + risposte secche
citabili dalle AI** (guide editoriali con schema Article/FAQPage). Da giocare:
verticali di settore, pagina stampanti, credenziali via SPID. Decisione presa:
**niente pagine confronto per-competitor** — resta la landing unica
`/confronto` (`src/lib/confronto/comparisons.ts`), da aggiornare
trimestralmente perché i pricing dei competitor cambiano.

## Produzione contenuti

Contenuti generati via LLM con **review umana**, in italiano, target Italia.
