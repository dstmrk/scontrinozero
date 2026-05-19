# ScontrinoZero — Piano di sviluppo

La versione pubblicata corrente è in `package.json`. Lo storico delle release è ricostruibile dai tag git (`git tag -l "v1.*"`).

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Roadmap

| Versione     | Descrizione                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **v1.3.0**   | Analytics dashboard Pro (KPI + sparkline + breakdown) + Export CSV scontrini Pro (download diretto streaming)                |
| **v1.3.1**   | Fix da code review v1.3.0 (security/correctness + UX/performance) — vedi backlog dedicato sotto                              |
| **v1.4.0**   | Coupon/promo codes, referral program, Stripe Customer Portal polish                                                          |
| **v1.5.0**   | Email scontrino al cliente (PDF allegato via Resend)                                                                         |
| **v1.7.0**   | Catalogo: modifica prodotto + sync AdE (HAR: aggiungi/modifica/elimina)                                                      |
| **v1.8.0**   | AdE auth multi-metodo: SPID e CIE selezionabili in onboarding + settings; cookie jar cifrato, re-auth on 401                 |
| **v1.9.0**   | CSV import prodotti, barcode scanner (BarcodeDetector API), Umami analytics                                                  |
| **v1.10.0+** | Bluetooth printing (58/80mm), Passkey                                                                                        |
| **v1.11.0**  | Storno avanzato: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento                   |
| **v1.x**     | Developer API Fase A: API key per-merchant, Pro gate, endpoints emissione/annullamento — vedi [DEVELOPER.md](./DEVELOPER.md) |
| **v2.0.0+**  | Developer API Fase B: partner account, management API, piani developer, webhook, multi-operatore                             |

---

## Backlog v1.3.1 (post-review v1.3.0)

10 task identificati nella code review del ciclo v1.3.0 (vedi `.claude/reviews/v1.3.0-review.md`). Decisione: tag v1.3.0 con feature complete, fix accumulati in v1.3.1 senza compromettere la release feature.

### Security / correctness

| #   | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Priorità |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | **Verify `changePassword` session rotation Supabase**: dopo `signInWithPassword` per re-auth il cookie di sessione potrebbe ruotare; il successivo `signOut({ scope: "others" })` potrebbe killare la sessione corrente invece di quelle altrove (o lasciare attiva quella pre-cambio). Verificare manualmente con Supabase + test E2E che (a) pre-cambio session sia invalidata, (b) session corrente resti valida. Vedi `src/server/profile-actions.ts:222-259`.                                  | P1       |
| 2   | **`signOut({scope: "others"})` con retry+backoff**: la revoca delle altre sessioni dopo cambio password è security-critical (attacker già loggato altrove resterebbe attivo). CLAUDE.md regola 17 richiede 3 retry con backoff esponenziale (500ms → 1s → 2s) + `logger.error({ critical: true })` su exhausted. Stesso pattern di `deleteAccount` auth user deletion. Vedi `src/server/profile-actions.ts:251-259`.                                                                                | P1       |
| 3   | **Fix `vi.setSystemTime` senza `vi.useFakeTimers` in `api-auth.test.ts`**: il test usa `vi.setSystemTime(NOW)` ma non chiama mai `vi.useFakeTimers()` prima. In alcune versioni Vitest è no-op silenzioso e i test che dipendono da `NOW` (es. expiresAt < NOW) passano solo per coincidenza temporale. Aggiungere `vi.useFakeTimers({ now: NOW })` in `beforeEach` + `vi.useRealTimers()` in `afterEach`. Vedi `src/lib/api-auth.test.ts:89-93,140-144`.                                            | P1       |
| 4   | **Catch-all "Non autenticato" in `assertProPlan`/`authorizePro`**: il pattern `try { await getPlan(authUserId) } catch { return 401 }` confonde profile-not-found, DB timeout, network glitch in un unico 401 misleading. Classificare l'errore: `DbTimeoutError` → 503, `ProfileNotFoundError` → 403, altri rethrow. Stesso fix in due luoghi: `src/lib/plans.ts:85-89` e `src/server/analytics-actions.ts:45-50`.                                                                                  | P1       |
| 5   | **`saveBusiness` preserve `preferredVatCode` se field assente**: stesso bug-class già fixato in `updateBusiness` (commit `fb38f62`). `onboarding-actions.ts:74` usa `getFormStringOrNull` che ritorna null sia per "field assente" sia per "field vuoto" → il branch UPDATE (riga 141) azzera silenziosamente la preferenza precedente. Applicare `formData.has("preferredVatCode")` per distinguere i due casi. Vedi `src/server/onboarding-actions.ts:74,141-153`.                                | P1       |

### UX / performance

| #   | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Priorità |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 6   | **Refactor analytics: shared dataset per render**: ogni visita a `/dashboard/analytics` esegue 4× `getPlan`, 3× `checkBusinessOwnership`, 3× docs query, 3× lines query (3 server actions × auth pipeline + DB amplification). Introdurre `getAnalyticsDataset(businessId, range)` che fa auth + docs + lines una volta sola, derivare KPI/timeseries/breakdown in memoria. Vedi `src/server/analytics-actions.ts:44-64,133-223` + `src/app/dashboard/analytics/page.tsx:51-55`.                      | P2       |
| 7   | **Rate limit sulle 3 server action analytics**: nessun rate limit sui path costosi (range 90d scansiona migliaia di documenti). Aggiungere bucket `analytics:<userId>` ~60/h coerente con convention CLAUDE.md (`pdf:<ip>` 60/h, `csv:<userId>` 10/h, `emit:<userId>` 30/h). Istanziare `RateLimiter` a livello modulo e applicare PRIMA di `fetchSaleDocsInRange`. Vedi `src/server/analytics-actions.ts`.                                                                                            | P2       |
| 8   | **Race condition su cambio range analytics rapido**: `handleRangeChange` lancia 3 server action in `Promise.all` dentro `startTransition`, senza cancellation. Se l'utente cambia range due volte velocemente, il risultato della prima richiesta può arrivare dopo la seconda e sovrascrivere il render con dati sbagliati. Fix: `useRef<AnalyticsRange>` per latest + ignore resolve fuori sequenza; o migrare a TanStack Query (già nelle deps). Vedi `src/components/analytics/analytics-client.tsx:56-70`. | P2       |
| 9   | **CSV export: colonna `id_documento_annullato` sempre vuota**: la query filtra `kind = "SALE"` ma la colonna è popolata solo su `kind = "VOID"`. Decidere: (a) rimuovere la colonna; (b) includere VOID con kind-aware rendering; (c) `LEFT JOIN` su `commercial_documents AS void_doc ON void_doc.voided_document_id = commercial_documents.id` per popolare la colonna sui `VOID_ACCEPTED`. Aggiungere test che documenti il comportamento atteso. Vedi `src/lib/receipts/csv-export.ts:90,29`.                | P2       |
| 10  | **Storico default 7 giorni in Europe/Rome**: `dashboard/storico/page.tsx:39-43` calcola il default con `today.toISOString().split('T')[0]` (UTC), inconsistente con la fix `ddeefe4` che ha ancorato i bucket analytics a Europe/Rome. Tra mezzanotte UTC e l'1/2 di mattino italiano il default sarebbe "ieri" anziché "oggi". Usare `formatInTimeZone(new Date(), "Europe/Rome", "yyyy-MM-dd")` (date-fns-tz). Vedi `src/app/dashboard/storico/page.tsx:39-43`.                                    | P2       |

---

## Lancio hard (milestone gated, non a calendario)

**Non parte a calendario. Parte solo quando tutti i criteri sotto sono veri.**

**Gate (tutti veri):**

- ⬜ ≥2 feature "in arrivo" Pro rilasciate (Export CSV + Analytics dashboard)
- ⬜ ≥5 recensioni reali per popolare `aggregateRating` su `SoftwareApplication`
- ⬜ Indicizzazione GSC completa (≥90% delle URL della sitemap indicizzate)
- ⬜ ≥30 utenti paganti per social proof onesto ("oltre 30 partite IVA…")

**Task lancio (quando il gate è verde):**

- ⬜ Listing su Capterra Italia, GetApp, AlternativeTo, SaaSHub (free)
- ⬜ Microsurvey post-onboarding per raccogliere review (G2 / Trustpilot / Capterra)
- ⬜ ProductHunt launch (lunedì/martedì mattina ora US)
- ⬜ Show HN su Hacker News
- ⬜ Outreach diretto a 3–5 commercialisti italiani con audience (newsletter / LinkedIn) per review indipendenti
- ⬜ Press release a blog tech IT (es. SaaS Italia, fattureecorrispettivi.it)
- ⬜ Monitorare Sentry/uptime durante il picco
- ⬜ Retrospettiva post-lancio: cosa ha convertito, cosa no, prossimi step SEO

---

## Architettura contenuti SEO

**Tesi.** Budget marketing zero, dominio nuovo, prodotto live: l'unica leva sostenibile è SEO + lancio open source mirato. La SEO classica è lenta (3–9 mesi a regime), quindi va **avviata subito** ma accompagnata da leve veloci (tool gratuiti, lancio comunità) che generino primi backlink e traffico in giorni invece che in mesi.

**Architettura.**

- `/help/*` — **operativo**: "come faccio X nel prodotto", middle-of-funnel, screenshot UI.
- `/guide/*` — **educativo**: top-of-funnel SEO, "documento commerciale online: cos'è, normativa, esempi". Intercetta utenti che non conoscono ancora il prodotto.
- `/per/[slug]` — **landing per categoria**, intercetta query "registratore di cassa per parrucchieri", "scontrini per ambulanti", ecc.
- `/confronto/[slug]` — **alta intenzione commerciale**, ScontrinoZero vs alternative.
- `/strumenti/[slug]` — **backlink magnets**: tool gratuiti che la gente linka spontaneamente.

Slug separati tra `/help` e `/guide` evitano canonical clash su keyword condivise (es. `/help/regime-forfettario` ≠ `/guide/regime-forfettario-scontrini`); si linkano a vicenda.

**Note operative.**

- **Niente promesse di feature non ancora live nel marketing copy**: gli articoli SEO si basano solo su feature già rilasciate. Le 4 feature "in arrivo" sul Pro (Analytics avanzata, Export CSV, Recupero AdE, Sync catalogo) restano in roadmap.
- **Tutti i contenuti generati via LLM con review umana**, in italiano, target Italia.
- **Gate del lancio hard** è esplicito (sopra): ProductHunt/HN sono "one-shot a memoria lunga", vanno sparati solo quando il sito è pronto a convertire un picco e le promesse Pro sono onorate.

---

## Backlog sicurezza / tech debt

| Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Priorità |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Enforcement limiti mensili Developer API**: `DEVELOPER_MONTHLY_LIMITS` è definito in `plans.ts` ma non applicato. Serve contatore per-business su finestra mensile UTC, blocco alla soglia con errore esplicito, e quota residua nel payload risposta. Implementare contestualmente al lancio dei developer plan in v2.0.0.                                                                                                                                                                                                                                                                                                                                                                                                                            | P1       |
| **Paginazione cursor-based su storico, export e Developer API**: `searchReceipts` carica tutti i documenti in memoria; `exportUserData` esporta senza limiti; `GET /api/v1/receipts` esegue `COUNT(*)` full-match a ogni richiesta paginata. Da affrontare quando il volume per-tenant lo richiede; per la Developer API implica un breaking change (rendere `total` opt-in via `includeTotal=true` o sostituirlo con `nextCursor`/`limit+1`).                                                                                                                                                                                                                                                                                                           | P2       |
| **TTL/revoca link pubblici scontrini**: sostituire accesso diretto via document UUID con share token separato, con `expires_at`, `revoked_at`, `last_accessed_at` e UI di rigenerazione/revoca. UUID da 122 bit è sicuro contro enumeration, ma un link condiviso per errore resta valido per sempre. Da fare in v1.4.0+.                                                                                                                                                                                                                                                                                                                                                                                                                                | P2       |
| **`getCatalogItems` paginazione + autocomplete server-side**: la query carica l'intero catalogo senza `LIMIT`. Per piano Pro illimitato un business con 5–10k articoli paga 1–5MB di JSON RSC su ogni apertura POS. Fix richiede refactor UI (Combobox prodotti → autocomplete debounced) + API con `limit/offset/q`. **Target: v1.7.0** (Catalogo: modifica prodotto + sync AdE, già in roadmap).                                                                                                                                                                                                                                                                                                                                                       | P2       |
| **Eliminare `'unsafe-inline'` da `script-src`** via hash o nonce per JSON-LD. Path A (hash): precomputare SHA-256 dei payload `softwareApplicationJsonLd`, `organizationJsonLd`, `faqPageJsonLd` e dei breadcrumb degli help dinamici, includerli in `buildCsp()` come `'sha256-XXX'`. Path B (nonce): middleware per request, incompatibile con SSG largo del sito marketing. Path A è preferibile ma fragile (ogni edit ai JSON-LD ricalcola hash). Da affrontare quando la frequenza di edit dei JSON-LD è bassa e il sito ha più traffico. `'unsafe-inline'` su `style-src` resta (refactor Tailwind 4 + Radix UI fuori scope).                                                                                                                      | P2       |
| **Key rotation zero-downtime**: `decrypt()` supporta già `Map<number, Buffer>`. Callers usano ancora `new Map([[version, getEncryptionKey()]])`. Serve runbook + script re-encryption + test E2E.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P3       |
| **Error envelope uniforme API**: standardizzare `{code, message, requestId}` su tutti gli endpoint; wrapping coerente delle integrazioni esterne con classificazione transient/permanent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P3       |
| **CAPTCHA hostname allowlist** (`TURNSTILE_ALLOWED_HOSTNAMES`): `verifyCaptcha()` in `src/server/auth-actions.ts` usa un singolo hostname exact-match. Supportare una lista di hostname configurabili (es. www + non-www, staging) senza dover aggiornare il codice. Da implementare solo se si aggiunge un terzo ambiente (staging/preview).                                                                                                                                                                                                                                                                                                                                                                                                            | P3       |
| **Recovery/replay eventi Stripe con claim bloccato**: se DELETE del claim fallisce dopo un errore di handleEvent, l'evento rimane in `stripe_webhook_events` con il claim permanente e Stripe non può ritentare. Aggiungere un job periodico (cron) che rileva claim rimasti "stuck" oltre N minuti (`processedAt < NOW - threshold`) e li elimina per sbloccare il retry. Richiede infrastruttura background task sul container.                                                                                                                                                                                                                                                                                                                        | P3       |
| **Stripe checkout: prevenzione customer orfani in race**: quando due richieste di checkout concorrenti dello stesso utente arrivano senza `stripeCustomerId`, entrambe possono creare un customer Stripe prima del claim DB. Il loser crea un customer inutilizzato. Fix: claim preventivo in DB (stato `creating_customer`) + solo il vincitore crea il customer; oppure cleanup job periodico via Stripe API. Da implementare in v1.4.0+.                                                                                                                                                                                                                                                                                                              | P3       |
| **DB defense-in-depth: CHECK constraints + length limits**: aggiungere `CHECK (col >= 0)` su `commercial_document_lines.quantity`/`gross_unit_price`, `catalog_items.default_price` e `CHECK (char_length(col) <= N)` su `profiles.email`, `commercial_document_lines.description`, `catalog_items.description`, `businesses.business_name`, `businesses.address`. Validazione DB indipendente dalla validazione applicativa Zod, evita import legacy / refactor che bypassano i refines. Migration handwritten, da raggruppare.                                                                                                                                                                                                                         | P3       |
| **Indice composito `api_keys (business_id, revoked_at)`**: partial index `WHERE revoked_at IS NULL` per query `listApiKeys()`. Cardinalità attuale 1–2 chiavi per business → impatto prestazionale ~0; rilevante quando arriveranno **piani Developer multi-key** (10–50 chiavi/business, tabella >10k chiavi). **Target: v2.0.0+** (Developer API Fase B).                                                                                                                                                                                                                                                                                                                                                                                              | P3       |
| **`stripe_webhook_events` RLS no-policy: aggiungere commento SQL esplicito**. La tabella ha RLS abilitato senza policy → default-deny per anon/authenticated, scrittura solo via service role webhook. Funzionalmente corretto, ma senza commento un futuro PR potrebbe aggiungere una policy permissiva pensando manchi. Fix: `COMMENT ON TABLE stripe_webhook_events IS '…'` nella prossima migration che tocchi la tabella.                                                                                                                                                                                                                                                                                                                           | P3       |
| **Centralizzare policy retry/timeout su chiamate esterne**: convivono pattern simili ma divergenti in `src/server/auth-actions.ts` (auth user delete con backoff), `src/lib/ade/real-client.ts` (sessione AdE), `src/lib/email.ts` (timeout via `Promise.race`), `src/lib/db-timeout.ts` (statement timeout + `retryOnStatementTimeout`). Drift = backoff diversi, log shape diversi, error class non uniformi. Fix: due utility comuni `retryTransient({attempts, baseDelayMs, jitter, classifyError})` + `withExternalTimeout(ms, fn)` e migrazione progressiva dei call-site. Convenzione log fields: `errorClass`, `provider`, `operation`, `retryAttempt`. Da affrontare quando si introduce un nuovo provider esterno (es. CIE login, AdE search). | P3       |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Performance percepita prima di tutto**: ogni interazione deve sembrare istantanea (optimistic UI, prefetching, stale-while-revalidate).
