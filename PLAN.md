# ScontrinoZero — Piano di sviluppo

La versione pubblicata corrente è in `package.json`. Lo storico delle release è ricostruibile dai tag git (`git tag -l "v1.*"`).

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Roadmap

| Versione     | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.4.0**   | Coupon/promo codes, referral program, Stripe Customer Portal polish · **Partner/reseller codes** (programma NDS) — vedi sezione dedicata sotto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
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

Modello **wholesale B2B**: un rivenditore porta esercenti sulla
piattaforma ScontrinoZero standard. L'esercente **non paga noi**: paga il
partner. Noi fatturiamo **al partner** un prezzo all'ingrosso per utente;
il partner rivende al prezzo che vuole e fa la **prima assistenza** alla propria rete.

Caratteristiche del modello scelto (le alternative white-label / licenza
multi-cliente / sottodominio dedicato sono state valutate e **scartate** per
ora: troppo lavoro o troppe implicazioni legali/tecniche — il sottodominio in
particolare riapre Turnstile hostname allowlist, cookie cross-origin e
`NEXT_PUBLIC_*` baked al build, vedi `CLAUDE.md` regola 15):

- **Attribuzione via codice univoco monouso** con prefisso per-partner
  (`<partner_id>_<univoco>`). Il prefisso permette il filtro/report con un semplice
  `LIKE '<partner_id>_%'` senza tabella di mapping.
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

| Colonna      | Tipo                   | Note                                                         |
| ------------ | ---------------------- | ------------------------------------------------------------ |
| `code`       | `text` PK              | Es. `PARTNER1_7K9F2QHX`. Formato validato lato app.          |
| `partner`    | `text` NOT NULL        | Es. `"PARTNER2"`. Coincide col prefisso prima del primo `_`. |
| `used_by`    | `uuid` NULL            | `auth_user_id` (o `profiles.id`) che ha consumato il codice. |
| `used_at`    | `timestamptz` NULL     | Valorizzato al claim.                                        |
| `created_at` | `timestamptz` NOT NULL | `defaultNow()`.                                              |

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
"unlimited include supporto prioritario _nostro_" diventa un problema reale.

### Generazione codici (script admin)

`scripts/generate-partner-codes.mjs` (+ test):

- Args: `--partner <partner_id> --count 50`.
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
   `https://app.scontrinozero.it/register?code=PARTNER1_7K9F2QHX` (niente
   sottodominio). Il client component legge `?code=`, lo mette in un campo
   (read-only o nascosto) e lo passa nel `formData`.
2. **Nuovo modulo** `src/lib/partner-code.ts` (+ test), speculare a
   `signup-source.ts`: `normalizePartnerCode()` valida **solo il formato**
   (regex `^[A-Z]{2,8}_[A-Z0-9]{8,10}$`, prefisso in allowlist `["PARTNER1"]`,
   lunghezza max). NON tocca il DB. Boundary API: validazione prima del service
   (`CLAUDE.md` regola 9).
3. In `signUp` (`src/server/auth-actions.ts`), **pre-check del codice PRIMA di
   `supabase.auth.signUp()`** — specularmente al pre-check email già presente
   (un `SELECT ... WHERE code = $code AND used_by IS NULL`). Se il codice manca
   o è già usato → rifiuto immediato con errore esplicito **senza creare l'auth
   user** (evita l'orfano nel caso comune). Questo pre-check è il motivo per cui
   l'ordine conta: vedi edge case "auth user orfano" sotto.
4. **Claim atomico race-safe DOPO la creazione dell'auth user**, nella stessa
   transazione dell'insert profilo (in `insertProfileOrRollback` o helper
   dedicato):

   ```
   UPDATE partner_codes
      SET used_by = $authUserId, used_at = now()
    WHERE code = $code AND used_by IS NULL
   RETURNING code;
   ```

   - 0 righe (TOCTOU: il codice è stato consumato tra pre-check e claim) →
     **trattare come fallimento di registrazione: compensating delete dell'auth
     user** (stessa `compensatingDeleteAuthUser` usata per il profile insert
     failure) + errore esplicito. Senza questo si lascia un auth user orfano e
     l'utente non può ritentare con la stessa email.
   - 1 riga → set `profiles.plan = 'unlimited'`, `profiles.referred_by = $code`,
     `planExpiresAt = signup + 1 anno` (**anchor informativo**, non
     auto-enforced: con `unlimited` né `canEmit` né `isTrialExpired` leggono
     `planExpiresAt`; serve solo come data di rinnovo e per lo script di
     sospensione — vedi Decisioni).
   - Usare `db.transaction()` con callback passthrough nei test (skill
     `testing-patterns`). Il claim DEVE essere atomico col profile insert per
     non lasciare codici consumati senza profilo (orfani).

5. **Gestione codice invalido/già usato — DECISO (a):** se il campo `code` è
   presente nel form, rifiutare la registrazione con **errore esplicito**
   ("Codice non valido o già utilizzato"). Niente fallback silenzioso a
   registrazione normale: l'utente è arrivato da un link partner e un codice
   rotto va segnalato, non degradato (e non vogliamo creargli per errore un
   account trial standard). Il rifiuto avviene preferibilmente nel pre-check
   (punto 3, nessun auth user creato); nel caso raro di race al claim (punto 4)
   il rifiuto è accompagnato dal compensating delete dell'auth user.

### Reporting & fatturazione (script admin)

`scripts/export-partner-billing.mjs` (+ test):

- Args: `--partner PARTNER1 --from YYYY-MM-DD --to YYYY-MM-DD`.
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
- Codice formato valido ma inesistente nel DB → rifiuto al pre-check, **nessun
  auth user creato** (assert: `compensatingDeleteAuthUser` non chiamata).
- **Codice invalido/già usato che supera il pre-check ma fallisce al claim**
  (TOCTOU): l'auth user è già stato creato → assert che venga fatto il
  compensating delete (no auth user orfano, utente può ritentare con la stessa
  email). Questo è il caso sollevato dalla review P2 su PR #555.
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

### Decisioni (confermate)

1. **Valore del piano: `unlimited`** (riuso del gating esistente) +
   `referred_by` per l'attribuzione. ✅
2. **`planExpiresAt` = `signup + 1 anno`, come anchor informativo
   non-enforced.** ✅ Con `unlimited` la scadenza non gatea (nessun taglio a
   sorpresa); serve solo come data di rinnovo e per rendere autoconsistente lo
   script di sospensione. La sospensione reale resta il **downgrade manuale**
   (read-only via `plan='trial'` + `trialStartedAt` passato). Check minore:
   verificare che la UI billing/settings non mostri una "scadenza" fuorviante
   a un utente `unlimited` (gli invite-only hanno verosimilmente `null`).
3. **Codice invalido al signup: errore esplicito, nessun fallback a trial.** ✅
4. **Unità di fatturazione: per utente attivo a fine primo mese, prepagato
   annuale.** ✅

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

## Strategia SEO & lancio (GTM)

**Tesi.** Budget marketing zero, dominio nuovo, prodotto live: l'unica leva sostenibile è SEO + lancio open source mirato. La SEO classica è lenta (3–9 mesi a regime), quindi va **avviata subito** ma accompagnata da leve veloci (tool gratuiti su `/strumenti`, lancio comunità) che generino primi backlink e traffico in giorni invece che in mesi.

**Stato.** L'architettura dei contenuti è **già live**: `/guide` (educativo top-of-funnel), `/per/[slug]` (landing per categoria), `/confronto` (alta intenzione commerciale), `/strumenti/[slug]` (backlink-magnet), affiancati a `/help` (operativo). Gli **invarianti redazionali** (data file per route, niente promesse di feature non live, slug separati `/help` vs `/guide`, review umana) vivono in `CLAUDE.md` regola 8. Da qui resta da eseguire il **lancio**, non l'architettura.

**Gate di lancio (hard).** ProductHunt/HN sono "one-shot a memoria lunga": vanno sparati una volta sola, solo quando il sito è pronto a convertire un picco e le promesse Pro sono onorate. Non anticipare.

---

## Bug noti / tech debt

Il registro dei bug noti, del tech debt e dei miglioramenti di
sicurezza/performance vive in [REVIEW.md](./REVIEW.md), ordinato per priorità
(P1/P2/P3) con file:riga, scenario e fix proposto per ogni voce. Anche la
motivazione dell'allowlist audit-ci (`GHSA-67mh-4wv8-2f99`) è lì, nella sezione
"Rischi accettati". `PLAN.md` resta la roadmap delle funzionalità: gli item di
REVIEW.md legati a una release (es. limiti Developer API → v2.0.0, autocomplete
catalogo → v1.7.0, allowlist SPID → v1.8.0) riportano il target nella voce
stessa.

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Performance percepita prima di tutto**: ogni interazione deve sembrare istantanea (optimistic UI, prefetching, stale-while-revalidate).
