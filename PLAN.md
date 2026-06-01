# ScontrinoZero — Piano di sviluppo

La versione pubblicata corrente è in `package.json`. Lo storico delle release è ricostruibile dai tag git (`git tag -l "v1.*"`).

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Roadmap

| Versione     | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.4.0**   | Coupon/promo codes, referral program, Stripe Customer Portal polish · **Partner/reseller codes** (programma NDS) — vedi sezione dedicata sotto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **v1.4.x**   | Supporto in-app: voce "Supporto" nelle impostazioni del dashboard (link a `/help/contatto-assistenza`, eventuale mailto pre-compilato). Da approfondire in conversazione ad-hoc prima della v1.5.0. **Durabilità idempotency welcome/operator email** (`verifyAdeCredentials`): oggi gating su `businessSnapshot.fiscalCode` (fix 6cc4057). Migrare a flag durabili `welcome_email_sent_at` / `operator_notified_at` su `businesses`, backfill da `created_at` dei business con `fiscalCode` già valorizzato. Sblocca audit trail, resilienza a reset manuale di `fiscalCode`, re-send esplicito futuro. Migration handwritten, ~6 file (migration SQL + journal + schema Drizzle + 2 server-action site + test). |
| **v1.5.0**   | Email scontrino al cliente (PDF allegato via Resend)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **v1.7.0**   | Catalogo: modifica prodotto + sync AdE (HAR: aggiungi/modifica/elimina)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **v1.8.0**   | AdE auth multi-metodo: SPID e CIE selezionabili in onboarding + settings; cookie jar cifrato, re-auth on 401                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **v1.9.0**   | CSV import prodotti, barcode scanner (BarcodeDetector API), Umami analytics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **v1.10.0+** | Bluetooth printing (58/80mm), Passkey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **v1.11.0**  | Storno avanzato: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **v1.x**     | Developer API Fase A: API key per-merchant, Pro gate, endpoints emissione/annullamento — vedi [DEVELOPER.md](./DEVELOPER.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **v2.0.0+**  | Developer API Fase B: partner account, management API, piani developer, webhook, multi-operatore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## v1.4.0 — Partner/reseller codes (programma "NDS")

> Spec autoconsistente: una conversazione nuova deve poter implementare questa
> feature leggendo solo questa sezione + i file referenziati. Rispetta le regole
> sempre-attive di `CLAUDE.md` (branch separato, TDD, migrations handwritten,
> boundary API, task > 3 file → sub-task).

### Obiettivo commerciale

Modello **wholesale B2B**: un rivenditore (primo partner: National Digital
Service SRLS, brand provvisorio "NDS Scontrini Digitale") porta esercenti sulla
piattaforma ScontrinoZero standard. L'esercente **non paga noi**: paga il
partner. Noi fatturiamo **al partner** un prezzo all'ingrosso per utente
(ipotesi iniziale: **€30/anno per utente, prepagato annuale**); il partner
rivende al prezzo che vuole e fa la **prima assistenza** alla propria rete.

Caratteristiche del modello scelto (le alternative white-label / licenza
multi-cliente / sottodominio dedicato sono state valutate e **scartate** per
ora: troppo lavoro o troppe implicazioni legali/tecniche — il sottodominio in
particolare riapre Turnstile hostname allowlist, cookie cross-origin e
`NEXT_PUBLIC_*` baked al build, vedi `CLAUDE.md` regola 15):

- **Attribuzione via codice univoco monouso** con prefisso per-partner
  (`NDS_<univoco>`). Il prefisso permette il filtro/report con un semplice
  `LIKE 'NDS_%'` senza tabella di mapping.
- **Monouso** = anti-leak: anche se il codice circola, vale una sola
  attivazione. Niente codice statico condiviso.
- **Free first month = concetto di fatturazione, non gate tecnico.** L'utente
  ottiene il piano attivo completo dalla registrazione; il partner viene
  fatturato a fine primo mese (= prepagato annuale). Che l'utente emetta o no
  non è un nostro problema dopo la fatturazione.
- **Sospensione legata agli insoluti del partner**, applicata ai **nuovi**
  utenti: chi ha un'annualità già fatturata completa i 12 mesi (evita di
  tagliare esercenti incolpevoli che hanno già pagato il partner).

### Modello dati

**1. Nuova tabella `partner_codes`** (migration handwritten `0016`, +
RLS in `0017` seguendo il pattern di `0004_add_api_keys` / `0005_api_keys_rls`).
Aggiornare anche `meta/_journal.json` (idx 16, 17) e lo schema Drizzle in
`src/db/schema/partner-codes.ts` (+ export in `src/db/schema/index.ts` e,
se servono, `relations.ts`). Eseguire `node scripts/check-migrations.mjs`.

| Colonna      | Tipo                      | Note                                                              |
| ------------ | ------------------------- | ----------------------------------------------------------------- |
| `code`       | `text` PK                 | Es. `NDS_7K9F2QHX`. Formato validato lato app.                    |
| `partner`    | `text` NOT NULL           | Es. `"NDS"`. Coincide col prefisso prima del primo `_`.           |
| `used_by`    | `uuid` NULL               | `auth_user_id` (o `profiles.id`) che ha consumato il codice.      |
| `used_at`    | `timestamptz` NULL        | Valorizzato al claim.                                             |
| `created_at` | `timestamptz` NOT NULL    | `defaultNow()`.                                                   |

- Indice su `partner` per i report. `code` è già PK (lookup O(1)).
- RLS: **service-role only** (questa tabella non è mai letta/scritta col client
  anon — solo server actions e script admin).

**2. Colonna `profiles.referred_by`** (`text` NULL) — migration `0016`
con `ADD COLUMN IF NOT EXISTS` (mai `NOT NULL` su tabella popolata, vedi
`CLAUDE.md` workflow migrazioni). Salva la **stringa completa del codice**
(`NDS_7K9F2QHX`). Il partner si deriva dal prefisso → niente seconda colonna.
Aggiornare `src/db/schema/profiles.ts`. È deliberatamente distinta da
`signup_source` (che resta per l'attribuzione dei canali di lancio, allowlist
in `src/lib/signup-source.ts`): semantiche diverse, non riusare quella colonna.

**3. Piano applicato — DECISIONE RACCOMANDATA: riuso di `unlimited`.**
L'utente partner riceve `plan = "unlimited"` (tutte le feature, gating già
pronto in `plans-shared.ts`: `canUsePro`, `canEmit`, catalogo ∞) **+**
`referred_by` per distinguerlo dagli unlimited invite-only. Vantaggio: **zero
nuovo codice di gating**. La disambiguazione per report/supporto è data da
`referred_by`, non dal valore del piano. Alternativa più pulita ma più costosa
(scartata per "minimo lavoro"): nuovo valore `plan = "partner"` nell'union di
`plans-shared.ts` → tocca `PLAN_VALUES`, CHECK constraint su `profiles.plan`,
tutti gli helper di gate e i relativi test. Da promuovere solo se la semantica
"unlimited include supporto prioritario *nostro*" diventa un problema reale.

### Generazione codici (script admin)

`scripts/generate-partner-codes.mjs` (+ test):

- Args: `--partner NDS --count 50`.
- Parte univoca: **8–10 char base32 senza caratteri ambigui** (escludere
  `0 O 1 I L`) per leggibilità/dettatura al telefono. Generazione
  crittograficamente sicura (`crypto.randomBytes`).
- Insert in `partner_codes` (gestire collisione PK con retry).
- Output: **CSV** (`code` per riga) da consegnare al partner.
- Idempotenza: re-run non deve duplicare; ogni codice è nuovo per definizione.

### Flusso registrazione

Riusa il pattern `?ref=` esistente (catturato in
`src/app/(auth)/register/page.tsx` via `useSearchParams().get("ref")` →
hidden field → `formData`), parallelo ma separato:

1. **Link precompilato** consegnato al partner:
   `https://app.scontrinozero.it/register?code=NDS_7K9F2QHX` (niente
   sottodominio). Il client component legge `?code=`, lo mette in un campo
   (read-only o nascosto) e lo passa nel `formData`.
2. **Nuovo modulo** `src/lib/partner-code.ts` (+ test), speculare a
   `signup-source.ts`: `normalizePartnerCode()` valida **solo il formato**
   (regex `^[A-Z]{2,8}_[A-Z0-9]{8,10}$`, prefisso in allowlist `["NDS"]`,
   lunghezza max). NON tocca il DB. Boundary API: validazione prima del service
   (`CLAUDE.md` regola 9).
3. In `signUp` (`src/server/auth-actions.ts`): dopo la validazione formato,
   **claim atomico race-safe** in `insertProfileOrRollback` (o helper
   dedicato), nella stessa transazione dell'insert profilo:
   ```
   UPDATE partner_codes
      SET used_by = $authUserId, used_at = now()
    WHERE code = $code AND used_by IS NULL
   RETURNING code;
   ```
   - 0 righe → codice inesistente o già usato → vedi gestione sotto.
   - 1 riga → set `profiles.plan = 'unlimited'`, `profiles.referred_by = $code`,
     `planExpiresAt` = +1 anno (o `null`, da confermare in "Decisioni").
   - Usare `db.transaction()` con callback passthrough nei test (skill
     `testing-patterns`). Il claim DEVE essere atomico col profile insert per
     non lasciare codici consumati senza profilo (orfani).
4. **Gestione codice invalido/già usato — DECISIONE DA CONFERMARE:**
   (a) rifiutare la registrazione con errore esplicito ("Codice non valido o
   già utilizzato"), oppure (b) fallback silenzioso a registrazione normale
   (trial standard, `referred_by = NULL`). Default proposto: **(a)** se il
   campo `code` è presente nel form (l'utente è arrivato da un link partner e
   un codice rotto va segnalato, non degradato silenziosamente).

### Reporting & fatturazione (script admin)

`scripts/export-partner-billing.mjs` (+ test):

- Args: `--partner NDS --from YYYY-MM-DD --to YYYY-MM-DD`.
- Query: `profiles WHERE referred_by LIKE 'NDS\_%'` (escape `_`) e
  `created_at` nella finestra. "Convertito/fatturabile" = oltre il primo mese
  (l'utente esiste, il free month è scaduto come concetto di billing).
- Output CSV: una riga per utente fatturabile (data registrazione, codice).
  È la base per la fattura B2B prepagata annuale al partner.

### Sospensione per insoluto (script admin)

`scripts/suspend-partner-users.mjs` (+ test):

- Sospende i **nuovi** utenti di un partner senza toccare chi ha annualità in
  corso già fatturata (la lista "intoccabile" arriva dall'export di billing già
  pagato).
- Meccanismo lightweight raccomandato: portare il piano a stato **read-only**
  (es. `plan='trial'` con `trialStartedAt` nel passato → `isTrialExpired` true,
  `canEmit` false). Reversibile ripristinando `plan='unlimited'`.
  In alternativa, se si adotta il piano dedicato `partner`, usare
  `planExpiresAt` nel passato con gate che lo rispetti. Confermare in
  "Decisioni" quale.

### Edge case da coprire con test (prima del commit, regola 4)

- Codice già usato (race tra due signup sullo stesso codice → solo uno vince,
  `INSERT/UPDATE ... WHERE used_by IS NULL`, skill `testing-patterns`).
- Codice formato valido ma inesistente nel DB.
- Codice prefisso non in allowlist (`XYZ_...`).
- Utente **già registrato** che apre un link con `?code=` (il pre-check email
  esistente fa redirect a `/verify-email` prima del claim → il codice **non**
  deve risultare consumato: ordinare il claim DOPO il pre-check email).
- Profilo insert fallisce dopo il claim → rollback del claim + compensating
  delete auth user (estendere `insertProfileOrRollback`).
- P.IVA UNIQUE: un utente che ritenta con stessa P.IVA non deve bruciare un
  secondo codice.
- Export con `_` nel `LIKE` correttamente escapato (no match accidentali).

### Touchpoint /help e legali (regole 8 e procedura T&C)

- `grep -rn "<termine>" src/app/(marketing)/help` per i termini "codice",
  "partner", "rivenditore": valutare una card FAQ ("Ho un codice da un
  partner") **al condizionale finché non rilasciato**.
- T&C: l'utente partner **usa comunque la nostra piattaforma** ed emette con le
  **proprie** credenziali Fisconline → responsabilità fiscale sua. Verificare
  che il flusso col codice **non salti** l'accettazione T&C/privacy (resta
  obbligatoria come negli altri signup). L'accordo wholesale col partner
  (prezzo, prepagato, insoluti→sospensione nuovi, assistenza L1 a carico
  partner) è **contrattuale, fuori dal codice**.

### Decisioni da confermare prima di implementare

1. **Valore del piano**: riuso `unlimited` (raccomandato, minimo lavoro) vs
   nuovo `partner`.
2. **`planExpiresAt`** sugli utenti partner: `+1 anno` (consente la logica di
   rinnovo/sospensione) vs `null` (illimitato finché non sospeso manualmente).
3. **Codice invalido in fase di signup**: errore esplicito (proposto) vs
   fallback a trial normale.
4. **Unità di fatturazione** confermata "per utente attivo a fine primo mese,
   prepagato annuale" (allineata all'accordo commerciale col partner).

### Suddivisione in sub-task (task > 3 file, regola 5)

1. **DB**: migration `0016` (tabella + `referred_by`) + `0017` (RLS) + journal +
   schema Drizzle + `check-migrations`.
2. **Validazione + claim**: `src/lib/partner-code.ts` + integrazione in
   `signUp`/`insertProfileOrRollback` + gestione codice invalido.
3. **Registrazione UI**: cattura `?code=` in `register/page.tsx`.
4. **Script admin**: generazione codici, export billing, sospensione.

Ogni sub-task è una PR separata con i suoi test (TDD), coverage on new code
≥ 80%, 0 nuove issue SonarCloud.

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

| Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Priorità |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **Enforcement limiti mensili Developer API**: `DEVELOPER_MONTHLY_LIMITS` è definito in `plans.ts` ma non applicato. Serve contatore per-business su finestra mensile UTC, blocco alla soglia con errore esplicito, e quota residua nel payload risposta. Implementare contestualmente al lancio dei developer plan in v2.0.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P1       |
| **Paginazione cursor-based su storico, export e Developer API**: `searchReceipts` carica tutti i documenti in memoria; `exportUserData` esporta senza limiti; `GET /api/v1/receipts` esegue `COUNT(*)` full-match a ogni richiesta paginata. Da affrontare quando il volume per-tenant lo richiede; per la Developer API implica un breaking change (rendere `total` opt-in via `includeTotal=true` o sostituirlo con `nextCursor`/`limit+1`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P2       |
| **TTL/revoca link pubblici scontrini**: sostituire accesso diretto via document UUID con share token separato, con `expires_at`, `revoked_at`, `last_accessed_at` e UI di rigenerazione/revoca. UUID da 122 bit è sicuro contro enumeration, ma un link condiviso per errore resta valido per sempre. Da fare in v1.4.0+.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P2       |
| **`getCatalogItems` paginazione + autocomplete server-side**: la query carica l'intero catalogo senza `LIMIT`. Per piano Pro illimitato un business con 5–10k articoli paga 1–5MB di JSON RSC su ogni apertura POS. Fix richiede refactor UI (Combobox prodotti → autocomplete debounced) + API con `limit/offset/q`. **Target: v1.7.0** (Catalogo: modifica prodotto + sync AdE, già in roadmap).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P2       |
| **Eliminare `'unsafe-inline'` da `script-src`** via hash o nonce per JSON-LD. Path A (hash): precomputare SHA-256 dei payload `softwareApplicationJsonLd`, `organizationJsonLd`, `faqPageJsonLd` e dei breadcrumb degli help dinamici, includerli in `buildCsp()` come `'sha256-XXX'`. Path B (nonce): middleware per request, incompatibile con SSG largo del sito marketing. Path A è preferibile ma fragile (ogni edit ai JSON-LD ricalcola hash). Da affrontare quando la frequenza di edit dei JSON-LD è bassa e il sito ha più traffico. `'unsafe-inline'` su `style-src` resta (refactor Tailwind 4 + Radix UI fuori scope).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | P2       |
| **Key rotation zero-downtime**: `decrypt()` supporta già `Map<number, Buffer>`. Callers usano ancora `new Map([[version, getEncryptionKey()]])`. Serve runbook + script re-encryption + test E2E.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P3       |
| **Error envelope uniforme API**: standardizzare `{code, message, requestId}` su tutti gli endpoint; wrapping coerente delle integrazioni esterne con classificazione transient/permanent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P3       |
| **CAPTCHA hostname allowlist** (`TURNSTILE_ALLOWED_HOSTNAMES`): `verifyCaptcha()` in `src/server/auth-actions.ts` usa un singolo hostname exact-match. Supportare una lista di hostname configurabili (es. www + non-www, staging) senza dover aggiornare il codice. Da implementare solo se si aggiunge un terzo ambiente (staging/preview).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P3       |
| **Recovery/replay eventi Stripe con claim bloccato**: se DELETE del claim fallisce dopo un errore di handleEvent, l'evento rimane in `stripe_webhook_events` con il claim permanente e Stripe non può ritentare. Aggiungere un job periodico (cron) che rileva claim rimasti "stuck" oltre N minuti (`processedAt < NOW - threshold`) e li elimina per sbloccare il retry. Richiede infrastruttura background task sul container.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P3       |
| **Stripe checkout: prevenzione customer orfani in race**: quando due richieste di checkout concorrenti dello stesso utente arrivano senza `stripeCustomerId`, entrambe possono creare un customer Stripe prima del claim DB. Il loser crea un customer inutilizzato. Fix: claim preventivo in DB (stato `creating_customer`) + solo il vincitore crea il customer; oppure cleanup job periodico via Stripe API. Da implementare in v1.4.0+.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P3       |
| **DB defense-in-depth: CHECK constraints + length limits**: aggiungere `CHECK (col >= 0)` su `commercial_document_lines.quantity`/`gross_unit_price`, `catalog_items.default_price` e `CHECK (char_length(col) <= N)` su `profiles.email`, `commercial_document_lines.description`, `catalog_items.description`, `businesses.business_name`, `businesses.address`. Validazione DB indipendente dalla validazione applicativa Zod, evita import legacy / refactor che bypassano i refines. Migration handwritten, da raggruppare.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | P3       |
| **Indice composito `api_keys (business_id, revoked_at)`**: partial index `WHERE revoked_at IS NULL` per query `listApiKeys()`. Cardinalità attuale 1–2 chiavi per business → impatto prestazionale ~0; rilevante quando arriveranno **piani Developer multi-key** (10–50 chiavi/business, tabella >10k chiavi). **Target: v2.0.0+** (Developer API Fase B).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P3       |
| **Centralizzare policy retry/timeout su chiamate esterne**: convivono pattern simili ma divergenti in `src/server/auth-actions.ts` (auth user delete con backoff), `src/lib/ade/real-client.ts` (sessione AdE), `src/lib/email.ts` (timeout via `Promise.race`), `src/lib/db-timeout.ts` (statement timeout + `retryOnStatementTimeout`). Drift = backoff diversi, log shape diversi, error class non uniformi. Fix: due utility comuni `retryTransient({attempts, baseDelayMs, jitter, classifyError})` + `withExternalTimeout(ms, fn)` e migrazione progressiva dei call-site. Convenzione log fields: `errorClass`, `provider`, `operation`, `retryAttempt`. Da affrontare quando si introduce un nuovo provider esterno (es. CIE login, AdE search).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P3       |
| **Test gap coverage** (carryover review v1.3.0): `getPlan` happy path su `pro`/`unlimited`/`developer_*` (`src/lib/plans.test.ts`), `assertProPlan` con errore transient (DB timeout), `saveBusiness` happy path con `preferredVatCode` valido (`tests/unit/server-onboarding-actions.test.ts`) e caso "field assente dal form".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | P3       |
| **`waitUntil` per fire-and-forget DB update `last_used_at`**: `src/lib/api-auth.ts:147-155` usa `db.update(...).catch(...)` fire-and-forget. Su Node container OK, ma su future deploy Edge/serverless il contesto può essere terminato prima del flush. Usare `import { waitUntil } from "next/server"` quando si introduce un secondo target di deploy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P3       |
| **Carryover review v1.3.0 — minor cluster** (raggruppati): (a) test fire-and-forget `_lastUsedUpdatePromise` racy in `api-auth.test.ts:309-325`; (b) analytics UX polish — restano: error banner inline + fallback `?? "Altro"` su `METHOD_LABELS` (NB: già presente come `?? e.method`, verificare se la semantica `Altro` è davvero attesa); chiusi in PR-Low del code review post-v1.3.2: tooltip leggibile in dark mode (`var(--popover)`/`var(--border)`) + aria-label `role="img"` + sr-only summary su tutti e 3 i widget recharts; (c) deep link `/dashboard/analytics?range=…` via searchParams (consistency con storico); (e) `onError` UI in `edit-business-section.tsx` che non discrimina retry-able vs permanent — cross-ref con P3 "Error envelope uniforme API" sopra; (f) verifica visiva post-migrazione react-day-picker v9→v10 (rename `table` → `month_grid`) del DateRangePicker storico; (g) `audit-ci.json` allowlist `GHSA-jxxr-4gwj-5jf2` senza nota motivazione/scadenza; (h) `.gitleaksignore` housekeeping (`git grep -l "REVIEW.md"` per orphan refs). Item (d) CSV API code smells risolto nel branch `claude/fix-top-bugs-DE49e` (OFFSET tie-break su id; `user!.id` e validazione doppia gia' assenti). `recharts` dynamic import: chiuso nel PR-Medium del code review post-v1.3.2 (i 3 widget caricati via `next/dynamic`, ~100KB fuori dal bundle iniziale). | P3       |

---

## Backlog contenuti help center

Articoli ancora da scrivere per chiudere la review dell'indice `/help`. Sono già listati nell'indice come placeholder "In arrivo" — vanno scritti **prima del tag v1.3.2** per poter dichiarare chiusa la passata di review marketing.

| Articolo                                                   | Card di destinazione           | Note                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Come stampare lo scontrino su carta termica                | Emissione e gestione scontrini | Articolo unico che copre: scelta stampante (raccomandazioni 58/80 mm), pairing Bluetooth da Android/iOS/desktop, troubleshooting di base (taglio, formato, connessione persa). Niente lista marche esaustiva: principi + esempio funzionante basta. |
| Come registrare un POS nel portale Fatture e Corrispettivi | POS e normativa                | Procedura sul portale AdE (Fatture e Corrispettivi → Corrispettivi → Gestore ed esercente → Censimento POS). Screenshot dei passaggi. Differenza fra POS bancario e POS-RT. Linkare a guida `/guide/pos-rt-obbligo-2026`.                           |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Performance percepita prima di tutto**: ogni interazione deve sembrare istantanea (optimistic UI, prefetching, stale-while-revalidate).
