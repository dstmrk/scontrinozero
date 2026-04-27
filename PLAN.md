# ScontrinoZero — Piano di sviluppo

## Versione corrente: v1.2.7 ✅ — Prossima release: v1.2.8 (SEO Foundations)

Il piano usa **release semantiche** (vx.y.z). La v1.1.0 è stata rilasciata in produzione.

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Release post-lancio (v1.x.y)

| Versione     | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **v1.1.0**   | ✅ Lotteria degli Scontrini: codice lotteria nel payload AdE, form emissione, storico, PDF                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **v1.1.1**   | ✅ Fix sicurezza/affidabilità: UUID validation, void atomicity, delete account retry, password reset hardening, trusted IP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **v1.1.2**   | ✅ Tech debt code review (parziale)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **v1.1.3**   | ✅ Tech debt code review: Zod safeParse route API v1, JOIN singolo per checkBusinessOwnership e fetchAdePrerequisites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **v1.1.4**   | ✅ Fix code review indipendente: body size limits (DoS), decimal precision fiscale, double fetch, email norm, verifyAdeCredentials atomicity, length constraints, Stripe error handling                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **v1.2.0**   | ✅ PWA: `@serwist/next`, manifest, offline shell, install prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **v1.2.1**   | ✅ Fix paginazione storico: server-side LIMIT/OFFSET, default 7gg (B2 parziale) + Stripe webhook dedup su `event.id` (B1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **v1.2.2**   | ✅ Fix subscription display (stato "pending" mostrava card mista) + webhook: `checkout.session.expired` cleanup + `charge.dispute.created` alerting                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **v1.2.3**   | ⬜ Landing & SEO polish: social proof, pagine dedicate funzionalità/prezzi, screenshot UI (gestita come patch)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **v1.2.4**   | ⬜ Help pages / documentazione utente (gestita come patch)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **v1.2.5**   | ✅ Security & GDPR polish: Turnstile nominato in Privacy Policy, key rotation runbook + script `rotate-encryption-key.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **v1.2.6**   | ✅ Fix code review indipendente: webhook atomic claim INSERT-first (P0-01), searchReceipts date validation + pageSize clamp (P1-01/P1-02), changePassword rate limit per-user (P1-03), rows_affected check nei 4 handler webhook (B10/P1-06), strict ISO date validation + off-by-one range fix api/v1/receipts (R-01/R-04), searchReceipts fail-fast su date invalide (R-02), webhook priceId ignoto ritenta invece di ackare (R-03) — seconda passata: webhook body limit 256KB (P0), searchReceipts range invertito (P1), verifyAdeCredentials optimistic lock (P1), timezone Europe/Rome su display e PDF (P2) |
| **v1.2.7**   | ✅ Rilasciato — descrizione da completare manualmente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **v1.2.8**   | ⬜ **SEO Foundations & E-E-A-T**: Google Search Console + Bing Webmaster, JSON-LD (`Organization`, `SoftwareApplication`, `BreadcrumbList` su `/help/*`, template `Article`), `opengraph-image.tsx` dinamico per ogni route marketing, pagina `/chi-siamo`, internal linking sistematico (3 correlati + CTA su ogni help), heading hierarchy review                                                                                                                                                                                                                                                                |
| **v1.2.9**   | ⬜ **Landing per categoria** (`/per/[slug]` × 7): ambulanti, parrucchieri-estetisti, artigiani, b&b, ncc-taxi, regime-forfettario, professionisti. JSON-LD `Service` + `BreadcrumbList`, link dalla home, sitemap                                                                                                                                                                                                                                                                                                                                                                                                   |
| **v1.2.10**  | ⬜ **Pagine comparative** (`/confronto/[slug]`): registratore-telematico, scontrinare, fatture-in-cloud. Tabelle oneste sui tradeoff, intercetta query commerciali ad alta intenzione                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **v1.2.11**  | ⬜ **Tool gratuiti backlink magnets** (`/strumenti/[slug]`): scorporo IVA, verifica codice lotteria, calcolatore risparmio vs RT. SSG, no auth, JSON-LD `WebApplication`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **v1.2.12**  | ⬜ **Guide evergreen — fase 1** (`/guide/[slug]`): 5 articoli pilastro top-of-funnel SEO (documento commerciale online, scontrino senza RT, differenza scontrino/ricevuta/fattura, POS+RT 2026, regime forfettario). Distinta da `/help/*` (operativo) per evitare canonical clash                                                                                                                                                                                                                                                                                                                                  |
| **v1.2.13**  | ⬜ **Guide evergreen — fase 2 + lancio soft**: 5 articoli (migrare da RT, chiusura giornaliera, annullare scontrino, lotteria scontrini lato commerciante, scegliere il piano). README GitHub curato + lancio Reddit `r/PartitaIVA`, IndieHackers, gruppi FB partite IVA, post LinkedIn                                                                                                                                                                                                                                                                                                                            |
| **v1.2.14**  | ⬜ **Lancio hard** (milestone gated, non a calendario): ProductHunt + Show HN + listing Capterra IT/GetApp/AlternativeTo/SaaSHub + outreach 3–5 commercialisti per review. **Gate (tutti veri):** v1.2.8→v1.2.13 live, ≥2 feature "in arrivo" Pro rilasciate (Export CSV + Analytics dashboard), ≥5 recensioni reali per `aggregateRating`, indicizzazione GSC completa, ≥30 utenti paganti per social proof                                                                                                                                                                                                          |
| **v1.3.0**   | Analytics dashboard, export CSV, coupon/promo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **v1.4.0**   | Coupon/promo codes, referral program, Stripe Customer Portal polish                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **v1.5.0**   | Email scontrino al cliente (PDF allegato via Resend)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **v1.6.0**   | Dashboard analytics: totale giornaliero, sparkline revenue, export CSV                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **v1.7.0**   | Catalogo: modifica prodotto + sync AdE (HAR: aggiungi/modifica/elimina)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **v1.8.0**   | AdE auth multi-metodo: SPID e CIE selezionabili in onboarding + settings; cookie jar cifrato nel DB, re-auth on 401                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **v1.9.0**   | CSV import prodotti, barcode scanner (BarcodeDetector API), Umami analytics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **v1.10.0+** | Bluetooth printing (58/80mm), Passkey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **v1.11.0**  | Storno avanzato: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **v1.x**     | Developer API Fase A: API key per-merchant, Pro gate, endpoints emissione/annullamento — vedi [DEVELOPER.md](./DEVELOPER.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **v2.0.0+**  | Developer API Fase B: partner account, management API, piani developer, webhook, multi-operatore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## Strategia SEO (v1.2.8 → v1.2.14)

**Tesi.** Budget marketing zero, dominio nuovo, prodotto live: l'unica leva sostenibile è
SEO + lancio open source mirato. La SEO classica è lenta (3–9 mesi a regime), quindi va
**avviata subito** ma accompagnata da leve veloci (tool gratuiti, lancio comunità) che
generino primi backlink e traffico in giorni invece che in mesi.

**Architettura contenuti.**

- `/help/*` (esistente, 21 articoli) — **operativo**: "come faccio X nel prodotto",
  middle-of-funnel, screenshot UI. Resta invariato.
- `/guide/*` (nuovo, v1.2.12+) — **educativo**: top-of-funnel SEO, "documento commerciale
  online: cos'è, normativa, esempi". Intercetta utenti che non conoscono ancora il prodotto.
- `/per/[slug]` (v1.2.9) — **landing per categoria**, intercetta query "registratore di cassa
  per parrucchieri", "scontrini per ambulanti", ecc.
- `/confronto/[slug]` (v1.2.10) — **alta intenzione commerciale**, ScontrinoZero vs alternative.
- `/strumenti/[slug]` (v1.2.11) — **backlink magnets**: tool gratuiti che la gente linka
  spontaneamente.

Slug separati tra `/help` e `/guide` evitano canonical clash su keyword condivise (es.
`/help/regime-forfettario` ≠ `/guide/regime-forfettario-scontrini`); si linkano a vicenda.

**Note operative.**

- **Niente Umami fino a v1.9.0**: per la SEO bastano Google Search Console + Bing Webmaster
  (gratis, immediati). Umami misura traffico web ma non è bloccante.
- **Tutti i contenuti generati via LLM con review umana**, in italiano, target Italia.
- **Niente promesse di feature non ancora live nel marketing copy**: gli articoli SEO si
  basano solo su feature già rilasciate. Le 4 feature "in arrivo" sul Pro (Analytics
  avanzata, Export CSV, Recupero AdE, Sync catalogo) restano in v1.3.0+.
- **Gate del lancio hard (v1.2.14)** è esplicito: ProductHunt/HN sono "one-shot a memoria
  lunga", vanno sparati solo quando il sito è pronto a convertire un picco e le promesse
  Pro sono onorate.

---

### v1.2.8 — SEO Foundations & E-E-A-T ⬜

**Task (TDD — test prima):**

- ⬜ Setup Google Search Console: verifica dominio, invio sitemap, baseline indicizzazione
  attuale (quante delle 21+ pagine sono indicizzate)
- ⬜ Setup Bing Webmaster Tools (stesso flusso)
- ⬜ JSON-LD `Organization` in `src/components/json-ld.tsx` + inserimento in `(marketing)/layout.tsx`
- ⬜ JSON-LD `SoftwareApplication` (con `offers` da `PricingSection`) sulla homepage
- ⬜ JSON-LD `BreadcrumbList` su tutti gli articoli `/help/*` (helper riusabile)
- ⬜ Template JSON-LD `Article` (per `/guide/*` futuro)
- ⬜ `opengraph-image.tsx` dinamico per ogni route marketing (Next.js SSG)
- ⬜ Pagina `/chi-siamo` con bio fondatore, P.IVA visibile, link contatti — segnali E-E-A-T
- ⬜ Internal linking sistematico: ogni `/help/*` linka 3 articoli correlati + CTA `/register`
- ⬜ Heading hierarchy review (un solo `h1` per pagina, gerarchia logica)
- ⬜ Aggiornare `sitemap.ts` con `/chi-siamo` + nuovi entry tests
- ⬜ Test: snapshot JSON-LD validi, `sitemap.test.ts` aggiornato, `chi-siamo.test.tsx`

---

### v1.2.9 — Landing per categoria ⬜

**Obiettivo.** Intercettare keyword long-tail "registratore di cassa per [categoria]",
"scontrino elettronico [categoria]", "obblighi fiscali [categoria]".

**Task (TDD — test prima):**

- ⬜ Route `/per/[slug]/page.tsx` con `generateStaticParams` per le 7 categorie
- ⬜ Template componente `CategoryLanding` (hero specifico, use-case, obblighi fiscali,
  tabella pricing, FAQ specifica, CTA)
- ⬜ Contenuti per: ambulanti, parrucchieri-estetisti, artigiani, b&b, ncc-taxi,
  regime-forfettario, professionisti
- ⬜ JSON-LD `Service` + `BreadcrumbList` per ognuna
- ⬜ Link dalla home (sezione "Perfetto per ogni attività" già esistente)
- ⬜ Aggiornare `sitemap.ts` + relativi test
- ⬜ Test: rendering, link interni, JSON-LD presente

---

### v1.2.10 — Pagine comparative ⬜

**Obiettivo.** Catturare query commerciali ad alta intenzione ("ScontrinoZero vs ...").

**Task (TDD — test prima):**

- ⬜ Route `/confronto/[slug]/page.tsx` con `generateStaticParams`
- ⬜ Componente `ComparisonTable` riusabile (estrarre dalla tabella della homepage)
- ⬜ Contenuti per: registratore-telematico (espansione della tabella home), scontrinare,
  fatture-in-cloud
- ⬜ Tono onesto, mostrare anche dove il competitor è migliore (credibilità)
- ⬜ JSON-LD `BreadcrumbList`
- ⬜ Aggiornare `sitemap.ts` + test

---

### v1.2.11 — Tool gratuiti (backlink magnets) ⬜

**Obiettivo.** Pagine utili che la gente linka spontaneamente; ingredienti per outreach.

**Task (TDD — test prima):**

- ⬜ Route `/strumenti/[slug]/page.tsx` (SSG, no auth)
- ⬜ `/strumenti/scorporo-iva` — input lordo + aliquota → imponibile + IVA, con copy fiscale
- ⬜ `/strumenti/verifica-codice-lotteria` — validazione formato codice (8 caratteri
  alfanumerici secondo specifica AdE)
- ⬜ `/strumenti/calcolatore-risparmio-rt` — input volume scontrini/anno, mostra TCO RT
  fisico vs ScontrinoZero su 5 anni
- ⬜ JSON-LD `WebApplication` per ognuno
- ⬜ Test unit per logica calcolatori (TDD), test rendering pagine

---

### v1.2.12 — Guide evergreen, fase 1 ⬜

**5 articoli pilastro top-of-funnel.**

**Task (TDD — test prima):**

- ⬜ Route `/guide/[slug]/page.tsx` con `generateStaticParams`, JSON-LD `Article` +
  `BreadcrumbList`, autore, data pubblicazione, tempo lettura
- ⬜ Template MDX o componente con sezioni standard (TL;DR, riferimenti normativi, esempi,
  FAQ, CTA, articoli correlati)
- ⬜ `/guide/documento-commerciale-online`
- ⬜ `/guide/scontrino-senza-registratore-di-cassa`
- ⬜ `/guide/differenza-scontrino-ricevuta-fattura`
- ⬜ `/guide/pos-rt-obbligo-2026`
- ⬜ `/guide/scontrino-regime-forfettario`
- ⬜ Internal linking: ogni guida → help correlati + altre guide
- ⬜ Aggiornare `sitemap.ts` + test
- ⬜ Test: rendering, JSON-LD valido, breadcrumb corretto

---

### v1.2.13 — Guide evergreen fase 2 + lancio soft ⬜

**Altri 5 articoli + primi outreach low-stakes.**

**Task contenuti (TDD per il rendering):**

- ⬜ `/guide/migrare-da-registratore-telematico-a-software`
- ⬜ `/guide/chiusura-giornaliera-corrispettivi`
- ⬜ `/guide/annullare-scontrino-elettronico`
- ⬜ `/guide/lotteria-scontrini-commerciante`
- ⬜ `/guide/scegliere-piano-scontrini-elettronici`

**Task lancio soft (no test, sono attività di marketing):**

- ⬜ README.md GitHub: badge build/license/version, screenshot, demo gif, link sito,
  istruzioni self-hosting
- ⬜ Post Reddit `r/PartitaIVA` (storia "ho costruito X per [problema]", non spam)
- ⬜ Post IndieHackers (versione inglese, focus open source)
- ⬜ Post 2–3 gruppi FB partite IVA italiani
- ⬜ Post LinkedIn personale fondatore
- ⬜ Tracciare conversioni post-lancio via GSC + tabella `profiles.signup_source` (campo
  nuovo, popolato da query string `?ref=`)

---

### v1.2.14 — Lancio hard (milestone gated) ⬜

**Non parte a calendario. Parte solo quando tutti i criteri sotto sono veri.**

**Gate (tutti veri):**

- ⬜ v1.2.8 → v1.2.13 live in produzione
- ⬜ ≥2 feature "in arrivo" Pro rilasciate (suggerito: Export CSV + Analytics dashboard,
  in `v1.3.0` / `v1.6.0` del PLAN)
- ⬜ ≥5 recensioni reali per popolare `aggregateRating` su `SoftwareApplication`
- ⬜ Indicizzazione GSC completa (≥90% delle URL della sitemap indicizzate)
- ⬜ ≥30 utenti paganti per social proof onesto ("oltre 30 partite IVA…")

**Task lancio (quando il gate è verde):**

- ⬜ Listing su Capterra Italia, GetApp, AlternativeTo, SaaSHub (free)
- ⬜ Microsurvey post-onboarding per raccogliere review (G2 / Trustpilot / Capterra)
- ⬜ ProductHunt launch (lunedì/martedì mattina ora US)
- ⬜ Show HN su Hacker News
- ⬜ Outreach diretto a 3–5 commercialisti italiani con audience (newsletter / LinkedIn)
  per review indipendenti
- ⬜ Press release a blog tech IT (ad es. SaaS Italia, fattureecorrispettivi.it)
- ⬜ Monitorare Sentry/uptime durante il picco
- ⬜ Retrospettiva post-lancio: cosa ha convertito, cosa no, prossimi step SEO

---

### v1.9.0 — Scontrino di annullamento (post-lancio) ⬜

Quando annulliamo uno scontrino, AdE genera un nuovo documento commerciale di annullamento.

**Task (TDD — test prima):**

- ⬜ Persistire nel DB il numero/progressivo del documento commerciale di annullamento restituito da AdE
- ⬜ Estendere `voidReceipt`/storico per esporre il riferimento del documento di annullamento
- ⬜ Aggiungere stampa/anteprima "scontrino di annullamento" dedicato
- ⬜ Includere nel layout testo di riferimento, es.:
  - `DOCUMENTO COMMERCIALE emesso per ANNULLAMENTO`
  - `Documento di riferimento: N. 0005-0009 del 03-06-2020`
- ⬜ Test TDD per mapping payload AdE, persistenza e rendering documento

---

## Backlog sicurezza / tech debt

| ID      | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Priorità |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **B1**  | **Stripe webhook dedup su `event.id`**: aggiungere tabella `stripe_webhook_events(event_id unique, processed_at, type, status)` + insert-if-not-exists atomico prima di processare. Stripe può inviare eventi duplicati; le operazioni del webhook sono idempotenti per natura ma la dedup riduce fragilità.                                                                                                                                                                                                                                                    | P2       |
| **B2**  | **Paginazione cursor-based su storico e export**: `searchReceipts` carica tutti i documenti in memoria; `exportUserData` esporta senza limiti. Da affrontare quando il volume per-tenant lo richiede.                                                                                                                                                                                                                                                                                                                                                           | P2       |
| **B3**  | **Key rotation zero-downtime**: `decrypt()` supporta già `Map<number, Buffer>`. Callers usano ancora `new Map([[version, getEncryptionKey()]])`. Serve runbook + script re-encryption + test E2E.                                                                                                                                                                                                                                                                                                                                                               | P3       |
| **B4**  | **Error envelope uniforme API**: standardizzare `{code, message, requestId}` su tutti gli endpoint; wrapping coerente delle integrazioni esterne con classificazione transient/permanent. _Precursore applicato in v1.1.4: try-catch espliciti su `stripe.customers.create`, `stripe.checkout.sessions.create`, `stripe.billingPortal.sessions.create` → 503 con log strutturato._                                                                                                                                                                              | P3       |
| **B5**  | **TTL/revoca link pubblici scontrini** (da code review P2-01): sostituire accesso diretto via document UUID con share token separato, con `expires_at`, `revoked_at`, `last_accessed_at` e UI di rigenerazione/revoca. UUID da 122 bit è sicuro contro enumeration, ma un link condiviso per errore resta valido per sempre. Da fare in v1.4.0+.                                                                                                                                                                                                                | P2       |
| **B6**  | **Enforcement limiti mensili Developer API** (da code review P1-02): `DEVELOPER_MONTHLY_LIMITS` è definito in `plans.ts` ma non applicato. Serve contatore per-business su finestra mensile UTC, blocco alla soglia con errore esplicito, e quota residua nel payload risposta. Implementare contestualmente al lancio dei developer plan in v2.0.0.                                                                                                                                                                                                            | P1       |
| **B7**  | **Stale PENDING recovery per emissione scontrini** (da code review P1-03): quando un documento è in PENDING da più di N minuti (crash/timeout downstream), il retry con la stessa idempotency key dovrebbe essere consentito. Attualmente il client riceve "stato inconsistente" e deve usare una nuova key (workaround UI: "svuota carrello e riprova"). Fix richiede: SELECT FOR UPDATE sul record, soglia stale configurabile, machine-readable error code. Da implementare contestualmente a B4 (error envelope uniforme).                                  | P2       |
| **B8**  | **CAPTCHA hostname allowlist** (`TURNSTILE_ALLOWED_HOSTNAMES`): `verifyCaptcha()` in `src/server/auth-actions.ts` usa un singolo hostname exact-match. Supportare una lista di hostname configurabili (es. www + non-www, staging) senza dover aggiornare il codice. Da implementare solo se si aggiunge un terzo ambiente (staging/preview).                                                                                                                                                                                                                   | P3       |
| **B9**  | **Recovery/replay eventi Stripe con claim bloccato**: con il pattern INSERT-first atomic claim (v1.2.6), se DELETE del claim fallisce dopo un errore di handleEvent, l'evento rimane in `stripe_webhook_events` con il claim permanente e Stripe non può ritentare. Aggiungere un job periodico (cron) che rileva claim rimasti "stuck" oltre N minuti (processedAt < NOW - threshold) e li elimina per sbloccare il retry. Richiede infrastruttura background task sul container.                                                                              | P3       |
| **B10** | ✅ **`rows_affected >= 1` check sui webhook handler critici** (da code review P1-06): implementato in v1.2.6. Nei 4 handler `invoice.paid`, `invoice.payment_action_required`, `invoice.payment_failed`, `checkout.session.expired` aggiunto `.returning()` + `logger.warn` se 0 righe aggiornate. Evento rimane acknowledged (200) per evitare retry infiniti su dati mancanti; il warn rende l'anomalia osservabile.                                                                                                                                          | P2       |
| **B11** | **Stripe checkout: prevenzione customer orfani in race** (da code review P2-01): quando due richieste di checkout concorrenti dello stesso utente arrivano senza `stripeCustomerId`, entrambe possono creare un customer Stripe prima del claim DB. Il loser crea un customer inutilizzato (già commentato come "acceptable orphan" nel codice). Fix: claim preventivo in DB (stato `creating_customer`) + solo il vincitore crea il customer; oppure cleanup job periodico via Stripe API (`/v1/customers` list + delete orphans). Da implementare in v1.4.0+. | P3       |
| **B12** | **`createApiKey` race condition** (da code review indipendente P1): count+insert su `src/server/api-key-actions.ts` non atomici — due richieste concorrenti per lo stesso business possono entrambe passare il check e inserire, superando il limite piano di 1 unità. Fix: `db.transaction()` + `SELECT ... FOR UPDATE` sulla riga business per serializzare operazioni per-business. Blast radius minimo (1 chiave extra) su deployment single-instance low-concurrency. Implementare quando si scala a multi-instance o su richiesta esplicita.              | P2       |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Stripe prima di PWA**: meglio pochi utenti paganti che tanti utenti gratuiti non monetizzati.
