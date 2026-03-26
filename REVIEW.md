# REVIEW.md — Full code review (produzione)

Data: 2026-03-26
Scope: intero repository
Priorità richiesta: **Sicurezza → Bug → Performance → CI/CD → Architettura**

## Executive summary

Questa review è orientata alla **riduzione del rischio in produzione**.
I punti più urgenti da risolvere subito sono:

1. hardening del rate limiting (trust IP + storage distribuito),
2. validazione UUID ai boundary API (evitare 500),
3. chiusura sessioni AdE via `finally`,
4. atomicità/coerenza lifecycle account (signup/delete),
5. timeout difensivi su chiamate AdE esterne.

---

## CRITICAL

### 1) [SECURITY] Rate-limit bypassabile via spoof IP headers

**Contesto**

- `src/server/auth-actions.ts` (`getClientIp`) usa fallback `x-forwarded-for` / `x-real-ip`.
- `src/app/r/[documentId]/pdf/route.ts` stessa logica per PDF pubblico.

**Rischio**
Con proxy non rigidamente trusted, un attacker può cambiare header IP ad ogni request e aggirare rate-limit.

**Fix (AI-actionable)**

1. Introdurre utility centralizzata `getTrustedClientIp()`.
2. In prod fidarsi solo di header del proxy trusted (es. Cloudflare) + fallback severo (`unknown`).
3. Aggiungere test anti-spoof.

**Acceptance criteria**

- Variare `x-forwarded-for` senza cambiare header trusted non modifica bucket rate-limit.

---

### 2) [SECURITY/RELIABILITY] RateLimiter process-local (non distribuito)

**Contesto**
`src/lib/rate-limit.ts` usa `Map` in-memory.

**Rischio**
Bypass su multi-instance, reset dopo restart/deploy, enforcement incoerente.

**Fix**

1. Introdurre `RateLimitStore` (memory + Redis/Upstash).
2. Usare store condiviso almeno per auth + API pubbliche.
3. Emettere `Retry-After`.

**Acceptance criteria**

- Contatori coerenti tra istanze diverse.

---

## HIGH

### 3) [BUG] UUID non validato su `/api/v1/receipts/[id]`

**Contesto**

- `src/app/api/v1/receipts/[id]/route.ts`
- `src/app/api/v1/receipts/[id]/void/route.ts`

`id` usato direttamente su colonne UUID.

**Rischio**
Input malformato può causare errore DB e 500.

**Fix**

1. Utility condivisa `isUuid`.
2. Return 400 prima della query.
3. Test negativi su ID invalidi.

---

### 4) [BUG] UUID non validato su route PDF autenticata

**Contesto**
`src/app/api/documents/[documentId]/pdf/route.ts` usa `documentId` senza pre-validazione.

**Rischio**
500 evitabile con input non UUID.

**Fix**
Riutilizzare la stessa utility `isUuid` del punto #3.

---

### 5) [BUG/ROBUSTNESS] Logout AdE non garantito in caso di errore

**Contesto**

- `src/lib/services/receipt-service.ts`
- `src/lib/services/void-service.ts`
- `src/server/onboarding-actions.ts` (`verifyAdeCredentials`)

Logout avviene solo nel percorso lineare.

**Rischio**
Sessioni AdE lasciate aperte su eccezioni post-login.

**Fix**

1. Pattern `try/finally`.
2. `logout` best-effort nel `finally` con warning non bloccante.

**Acceptance criteria**

- Dopo login, logout sempre tentato una volta anche su errore.

---

### 6) [BUG/COMPLIANCE] Signup non atomica (Auth vs `profiles`)

**Contesto**
`src/server/auth-actions.ts` crea utente Supabase Auth e poi scrive `profiles` separatamente.

**Rischio**
Se insert `profiles` fallisce, utente Auth può restare orfano e i termini non risultano registrati.

**Fix**

1. Compensazione: delete utente Auth su failure `profiles`.
2. Gestione esplicita del caso `data.user` assente/no error.
3. Alert su mismatch Auth/Profile.

---

### 7) [BUG/ACCOUNT-LIFECYCLE] Delete account non atomica

**Contesto**
`src/server/account-actions.ts` elimina prima `profiles`, poi tenta delete Auth; se fallisce logga e continua.

**Rischio**
Account Auth “zombie” (login possibile ma stato app incoerente).

**Fix**

1. Retry affidabile (job/outbox) delete Auth.
2. Guard globale per user autenticato senza `profile` con messaggio esplicito.
3. Monitor orphan count.

---

### 8) [RELIABILITY/PERFORMANCE] Chiamate AdE senza timeout difensivo

**Contesto**
`src/lib/ade/real-client.ts` usa `fetch` senza `AbortController` timeout centralizzato.

**Rischio**
Request esterne lente possono saturare worker/istanze e aumentare latenza tail.

**Fix**

1. Wrapper fetch con timeout configurabile (es. env `ADE_HTTP_TIMEOUT_MS`).
2. Retry limitato solo su errori transient idempotenti.
3. Logging strutturato di timeout.

**Acceptance criteria**

- Endpoint fallisce in modo controllato entro timeout massimo definito.

---

### 9) [RELIABILITY] Fire-and-forget DB update senza `.catch`

**Contesto**
`src/lib/api-auth.ts`: update `lastUsedAt` con `void db.update(...)`.

**Rischio**
Possibile unhandled rejection in caso di errore DB.

**Fix**
Aggiungere `.catch((err) => logger.warn(...))` mantenendo la natura non bloccante.

---

## MEDIUM

### 10) [BUG] Domain routing fragile su `Host` con porta

**Contesto**
`src/proxy.ts` confronta `host` con exact string match.

**Rischio**
`Host: app.example.com:443` può rompere i redirect attesi.

**Fix**
Normalizzare host (lowercase + strip porta) prima del confronto.

---

### 11) [PERFORMANCE] Doppio fetch DB sulla ricevuta pubblica

**Contesto**
`src/app/r/[documentId]/page.tsx` chiama `fetchPublicReceipt` in `generateMetadata` e nel page render.

**Rischio**
Due query per la stessa pagina.

**Fix**
Memoization server-side (`cache()`) o ridurre fetch nel metadata.

---

### 12) [PERFORMANCE] Roundtrip query evitabili in path hot

**Contesto**

- `fetchAdePrerequisites` (`src/lib/server-auth.ts`) usa query separate.
- Ownership checks spesso in 2 step profile→business.

**Fix**
Unificare con join mirate e helper query condivisi.

---

### 13) [CI/CD] Deploy da tag non vincolato esplicitamente a CI green sullo stesso SHA

**Contesto**
`.github/workflows/deploy.yml` parte su tag; manca guard esplicita su esito CI del commit taggato.

**Fix**
`workflow_run` da CI green o controllo status checks via API prima del push immagine.

---

### 14) [CI/CD/SECURITY] Audit dipendenze condizionale al diff

**Contesto**
`.github/workflows/ci.yml` esegue `audit` solo su alcuni cambi file.

**Rischio**
Nuove CVE su dipendenze esistenti possono non emergere su PR che non toccano quei file.

**Fix**
Aggiungere audit schedulato (es. giornaliero/settimanale) + opzionale always-on su push main.

---

### 15) [ARCHITECTURE] Validazioni distribuite e duplicate tra route/action/service

**Rischio**
Drift comportamentale tra canali UI/API e manutenzione più costosa.

**Fix**
Centralizzare schema validation server-side (es. Zod) + error model unico (`code/message/details`).

---

## LOW

### 16) [SECURITY HARDENING] Verifica Turnstile solo su `success`

**Contesto**
`src/server/auth-actions.ts` controlla principalmente `data.success`.

**Fix**
Validare anche `hostname`/`action` ritornati dal provider.

---

### 17) [CI/CD/RELIABILITY] Migration runner senza checksum immutability

**Contesto**
`scripts/migrate.ts` traccia solo `filename` in `__applied_migrations`.

**Rischio**
Se un file SQL storico viene modificato accidentalmente/malevolmente, la deriva non è rilevata automaticamente.

**Fix**

1. Salvare hash contenuto (es. SHA-256) in tabella migrazioni applicate.
2. Verificare hash a startup prima di applicare nuove migrazioni.

---

## Piano operativo consigliato (ordine esecuzione)

1. **Hotfix sicurezza/affidabilità**: #1 #2 #3 #4 #5 #8 #9
2. **Coerenza account lifecycle**: #6 #7
3. **Efficienza runtime**: #10 #11 #12
4. **Hardening delivery process**: #13 #14 #17
5. **Refactoring architetturale graduale**: #15 #16
