# Code review v1.2.15 — hardening pass

Review eseguita 2026-05-15 su branch `claude/plan-release-1.2.15-HKny3`.

3 agent review paralleli su:

1. **Auth / GDPR / session** — `src/server/auth-actions.ts`, `profile-actions.ts`, `export-actions.ts`, `proxy.ts`, `(auth)/**`
2. **Billing / AdE** — `src/app/api/stripe/**`, `src/server/onboarding-actions.ts`, `src/lib/ade/**`, `src/lib/services/{receipt,void}-service.ts`, `src/lib/crypto.ts`
3. **API / DB / rate-limit** — `src/app/api/v1/**`, `src/lib/api-auth.ts`, `src/lib/rate-limit.ts`, `src/db/schema/**`, `supabase/migrations/*.sql`

Scope di fix per v1.2.15: **P0 + P1 + P2 security-relevant**. P2 non-security e P3 → backlog.

---

## Riepilogo

| Severità         | Trovati | In scope v1.2.15 | Fuori scope (backlog) |
| ---------------- | ------- | ---------------- | --------------------- |
| **P0**           | 0       | 0                | —                     |
| **P1**           | 4       | 4                | 0                     |
| **P2 security**  | 5       | 5                | 0                     |
| **P2 non-sec**   | 2       | 0                | 2                     |
| **P? da verif.** | 1       | 1 (verifica)     | 0                     |

**Esito generale:** codice solido, nessun blocker. I finding sono tutti incrementali — più "polish security" che "buchi". Quattro P1 reali sono concentrati su due aree: race con auth user + recovery AdE.

---

## P0 — Blocker

Nessuno.

---

## P1 — Correctness / reliability

### P1-01 — Orphan Supabase auth user su signUp race con unique-constraint email

**File:** `src/server/auth-actions.ts:142-151` (insertProfileOrRollback) chiamato da `signUp` riga ~235.
**Categoria:** correctness
**Descrizione:** Due `signUp` concorrenti per stessa email superano entrambi il pre-check (riga 213-217), entrambi chiamano `supabase.auth.signUp` creando due auth user. Il perdente sull'INSERT in `profiles` finisce nel ramo `isUniqueConstraintViolation` e ritorna l'errore **senza** eseguire il compensating `deleteUser(authUserId)` — al contrario del ramo generico. Risultato: auth user zombie senza profile. Viola CLAUDE.md regola #17.
**Suggested fix:** spostare il `deleteUser(authUserId)` (con i 3 retry + backoff come in `deleteAccount`) fuori dal `else`, eseguirlo per qualunque errore di insertProfile inclusa unique-constraint violation.
**Test:** simulare due signUp concorrenti con stesso email, verificare che dopo il fallimento non resti l'auth user via `supabaseAdmin.auth.admin.listUsers()`.

### P1-02 — `subscription.deleted` non azzera `stripeSubscriptionId` / `currentPeriodEnd`

**File:** `src/app/api/stripe/webhook/route.ts:299-326` (handleSubscriptionDeleted).
**Categoria:** correctness
**Descrizione:** Setta solo `status: "canceled"` su `subscriptions` e `plan: "trial"` su `profiles`, lascia `stripePriceId`/`stripeSubscriptionId`/`currentPeriodEnd` invariati. Al successivo checkout la riga sopravvive con il vecchio `stripeSubscriptionId`; quando arriva un `customer.subscription.updated` per la NUOVA sub, `applySubscriptionUpdate` cerca per `stripeSubscriptionId` e non trova → log warn, niente UPDATE. Salvato solo da `syncSubscriptionData` (chiamato da `checkout.session.completed`) che filtra per `stripeCustomerId`. Se invece arriva prima un `invoice.payment_failed`, stato out-of-sync.
**Suggested fix:** in `handleSubscriptionDeleted`, settare anche `stripeSubscriptionId: null`, `currentPeriodEnd: null`, `stripePriceId: null` nella stessa transaction.
**Test:** mock evento `customer.subscription.deleted`, verificare row finale dei tre campi.

### P1-03 — Void recovery: rieseguire `submitVoid` senza idempotency-key AdE può creare duplicati

**File:** `src/lib/services/void-service.ts:332-577` (path `prepareVoidDocument` → `submitVoidToAde` quando `hasAdeTransaction === false`); stesso pattern in `receipt-service` per SALE recovery.
**Categoria:** correctness
**Descrizione:** Il recovery B7 di una row PENDING stale con `adeTransactionId IS NULL` ri-invoca `adeClient.submitVoid(payload)`. AdE non accetta una chiave d'idempotenza nel payload (`mapVoidToAdePayload` non emette nulla del genere — `src/lib/ade/mapper.ts:317`). Se il primo attempt è arrivato a destinazione su AdE ma la risposta è andata persa (timeout / connessione interrotta), la seconda chiamata crea un VOID duplicato — irreversibile. Stesso rischio sul SALE recovery, anche se meno frequente.
**Suggested fix:** prima del retry, chiamare `searchDocuments`/`getDocument` su AdE per verificare se esiste già un documento collegato (per VOID: `progressivoCollegato == saleAdeProgressive`). Alternativa più conservativa: alzare `STALE_PENDING_THRESHOLD_MINUTES` a 30 (default oggi 5) per ridurre la collision window, ma non elimina il problema. Documentare il rischio residuo in CLAUDE.md.
**Test:** TDD con MockAdeClient che a 1° call simula success ma il chiamante non lo registra (DB resta PENDING); 2° call deve essere skippata in favore di un lookup AdE.

### P1-04 — User enumeration esplicito su signUp pre-check

**File:** `src/server/auth-actions.ts:219-224`
**Categoria:** security (information disclosure)
**Descrizione:** Il pre-check pre-Supabase risponde con "Un account con questa email esiste già…" se l'email è in `profiles`. Anche con Turnstile a monte (~$0.001/solve via servizi anti-captcha) + rate-limit per-IP 5/15min, un attacker su botnet può enumerare. Il `resetPassword` invece redirect-a-`/verify-email` senza distinguere (CLAUDE.md regola #19 nello spirito). Inconsistenza tra i due flussi.
**Suggested fix:** sostituire il messaggio con redirect generico a `/verify-email` (come `resetPassword`). Tollerare il successo silenzioso di Supabase (con `Confirm email = on` ritorna `data.user = null` per anti-enumeration), oppure check applicativo che restituisca sempre la stessa response indipendentemente da esistenza email.
**Test:** signUp con email già registrata → response indistinguibile da signUp con email nuova (status, body, redirect, header).

> Reclassificato a P1: ho promosso da P2 (originale dell'agent auth) perché user enumeration su signup è esplicitamente menzionato nelle best practice OWASP e nelle release precedenti il pattern era già stato corretto su resetPassword — l'incoerenza è regression-prone.

---

## P2 — Security relevant (in scope)

### P2-01 — `signIn` senza Turnstile → credential stuffing

**File:** `src/server/auth-actions.ts:259-295`
**Descrizione:** Login con solo rate-limit per-IP (5/15min). Su botnet con IP rotation il limit non frena attacker. Supabase `signInWithPassword` ritorna 400 "Invalid login credentials" — se l'email non è registrata, su alcune config Supabase ritorna un errore distinguibile (da verificare in pannello).
**Suggested fix:** aggiungere widget Turnstile a `/login` (componente già usato in `/register`) + `verifyCaptcha({ expectedAction: "signin" })` nell'action. Mantenere rate-limit IP come secondo strato.
**Test:** signIn senza token captcha → 400 "captcha required"; con token finto → 400 "captcha failed".

### P2-02 — `resetPassword` senza Turnstile → email-bomb / esaurimento quota Resend

**File:** `src/server/auth-actions.ts:324-390`
**Descrizione:** Endpoint pubblico che invia email transazionali via Resend. Senza captcha, un attacker può chiamarlo a tappeto su email di vittime conosciute esaurendo la quota free-tier (3.000/mese) e degradando deliverability del dominio.
**Suggested fix:** stesso pattern di P2-01 (Turnstile + verifyCaptcha con `expectedAction: "reset-password"`).
**Test:** reset senza token captcha → no email inviata, response generica come oggi.

### P2-03 — Middleware fail-open quando `NEXT_PUBLIC_SUPABASE_URL` mancante

**File:** `src/proxy.ts:88-90`
**Descrizione:** Se la URL non è settata (deploy misconfigurato), il middleware bypassa la protezione su `/dashboard` e `/onboarding`. Server actions protette da `getAuthenticatedUser()` che lancia — quindi mitigato — ma pagine RSC potrebbero rendere UI privata senza chiamare la guardia. Pattern fail-open in costrutto di sicurezza.
**Suggested fix:** fail-closed in production: se URL mancante e `NODE_ENV === "production"`, redirect a `/login?error=config` o ritornare 503. Bypass `next()` permesso solo in dev/test.
**Test:** unit test su middleware con `NODE_ENV=production` + URL undefined → response status 503 o redirect.

### P2-04 — `changePassword` non revoca le altre sessioni attive

**File:** `src/server/profile-actions.ts:170-179`
**Descrizione:** Dopo `updateUser({ password })`, Supabase NON revoca per default i refresh token degli altri device. Per un cambio password motivato da sospetto compromissione, l'attaccante resta loggato altrove.
**Suggested fix:** dopo `updateUser`, chiamare `supabaseAdmin.auth.admin.signOut(user.id, "global")`. Aggiungere copy nell'UI: "Il cambio password disconnette tutti gli altri dispositivi".
**Test:** mock `supabaseAdmin.auth.admin.signOut` chiamato con `user.id` e scope `"global"`.

### P2-05 — `authenticateApiKey` espone stato della key via messaggi 401 differenziati

**File:** `src/lib/api-auth.ts:79-89`
**Descrizione:** Ritorna messaggi distinti ("API key non valida", "API key revocata", "API key scaduta"). Un attacker in possesso di una raw key impara se la key è solo revocata/scaduta vs mai esistita — utile in scenari di key exfiltration. Info-leak minore (l'attaccante deve già avere la raw key segreta), ma viola "errore generico per tutte le auth failures".
**Suggested fix:** unificare i 3 rami in `{ error: "API key non valida.", status: 401 }`; mantenere il dettaglio solo nei log strutturati (`logger.warn({ apiKeyId, reason: "revoked" })`).
**Test:** api request con key revocata e key scaduta → response body identico byte-per-byte.

---

## P? — Da verificare

### V-01 — `changePassword` re-auth via `signInWithPassword`: compat con MFA

**File:** `src/server/profile-actions.ts:161-168`
**Descrizione:** Se Supabase MFA è abilitato sul progetto, `signInWithPassword` da solo non basta a re-autenticare (richiede AAL2). L'UX si rompe per utenti MFA. Da verificare config Supabase di prod.
**Azione:** check su dashboard Supabase → Authentication → Multi-Factor. Se MFA è OFF (verosimile, non è feature live di ScontrinoZero), nessun fix. Se ON, sostituire con `supabase.auth.reauthenticate()`.

---

## Fuori scope v1.2.15 — Backlog

### B-doc-01 — `stripe_webhook_events` RLS senza policy: aggiungere commento esplicito

**File:** `supabase/migrations/0013_stripe_webhook_events.sql:10`
**Categoria:** docs / defense-in-depth
**Azione:** non-urgente, aggiungere commento SQL nella migration prossima che ne modifichi: `COMMENT ON TABLE stripe_webhook_events IS 'RLS enabled with no policy → default-deny; only service role writes via webhook handler'`. **→ B21 in PLAN.md backlog.**

### B-rel-01 — Stripe customer orfani su double-click checkout

**File:** `src/app/api/stripe/checkout/route.ts:62-108`
**Categoria:** reliability / billing hygiene
**Azione:** già documentato come "acceptable orphan" nel codice + tracciato come **B11** in PLAN.md (P3). Confermo che resta in backlog, P3.

---

## Falsi positivi verificati (mantenuti per memoria)

Dai 3 agent: ~30 controlli passati senza finding. Highlights del codebase già robusto:

- Webhook signature verification + body raw read corretti
- `event.id` dedup con INSERT-first atomic claim
- `rows_affected` check sui 4 webhook handler critici (B10)
- AdE encryption AES-256-GCM con versioning, IV random, auth tag
- Cookie jar in-memory (no DB persistence)
- Transaction wrapping su emit/void + statement timeout
- Idempotency key scope per-tenant (UNIQUE(business_id, key))
- UUID validation ai boundary (5 endpoint)
- Money precision con `.refine` su Zod
- Rate limit per-API-key sui v1, per-IP sugli endpoint pubblici
- CF-Connecting-IP trust model corretto (regola #15)
- Body size guard 32 KB / 8 KB / 256 KB con `readJsonWithLimit`
- RLS multi-tenant su 8 tabelle scoped
- Migration journal coerente (15 entries, 0000-0014)
- Drizzle schema ↔ migrations allineato
- Pagination limit cap (MAX_LIMIT=100), date range cap (MAX_RANGE_DAYS=31)
- Date parsing strict (regex + round-trip)
- Zod safeParse ovunque, no parse() raw
- Zero pattern `record[userInput]` senza Set/type-guard
- `getAuthenticatedUser` usa `getUser()` (JWT valida), non `getSession()`
- `deleteAccount` ordering corretto (auth-first, retry+backoff)
- `resetPassword` link hostname validation
- `exportUserData` filter per userId/businessId (no cross-tenant)
- `verifyCaptcha` con hostname + remoteip
- Callback route blocca redirect non-relative

---

## Ordine di esecuzione proposto

Da affrontare in PR atomiche (un finding = un commit), nell'ordine:

| #   | Finding   | Effort stim. | File principali                                                                        |
| --- | --------- | ------------ | -------------------------------------------------------------------------------------- |
| 1   | **P1-01** | 1h           | `auth-actions.ts` (1 file + test)                                                      |
| 2   | **P1-02** | 45min        | `webhook/route.ts` (1 file + test)                                                     |
| 3   | **P1-04** | 1h           | `auth-actions.ts`, `(auth)/register/page.tsx`, test                                    |
| 4   | **P2-01** | 1h           | `auth-actions.ts`, `(auth)/login/page.tsx`, test                                       |
| 5   | **P2-02** | 45min        | `auth-actions.ts`, `(auth)/reset-password/page.tsx`, test                              |
| 6   | **P2-03** | 30min        | `proxy.ts`, test                                                                       |
| 7   | **P2-04** | 30min        | `profile-actions.ts` (1 file + test)                                                   |
| 8   | **P2-05** | 30min        | `api-auth.ts` (1 file + test)                                                          |
| 9   | **P1-03** | 2-3h         | `void-service.ts`, `receipt-service.ts`, mapper, test (più complesso, possibile split) |
| -   | **V-01**  | 5min check   | nessun file, solo verifica config Supabase                                             |

**Totale stimato:** 7-9 ore di lavoro, distribuibili in 2-3 sessioni. P1-03 è il più complesso e potrebbe richiedere uno spike di design (lookup AdE pre-retry). Se eccede 3 file → split in sub-task come da CLAUDE.md regola #5.
