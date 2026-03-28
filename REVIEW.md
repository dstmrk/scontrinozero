# REVIEW.md — Code review aggiornata (accuratezza-first)

Data revisione: 2026-03-28  
Scope: intero repository  
Metodo: verifica puntuale dei punti aperti + analisi aggiuntiva su sicurezza, affidabilità, performance, architettura.

---

## Executive summary

Stato generale: **molto migliorato** rispetto alla review precedente.  
Ho verificato che **10/15 punti originali risultano risolti** (o sostanzialmente risolti), mentre **5/15 restano aperti** (2 critici, 2 alti, 1 medio).

Inoltre, dall’analisi del codice emergono **3 ulteriori miglioramenti importanti**:

1. validazione di `idempotencyKey` lato API (evitare 500 su UUID malformati),
2. atomicità degli update nel flusso di annullo (`VOID` + update documento `SALE`),
3. hardening del reset password (evitare open redirect nei link recovery).

---

## Verifica puntuale dei punti della review precedente

Legenda: ✅ risolto · 🟡 parziale · ❌ aperto

### 1) [SECURITY] Rate-limit bypass via spoof IP headers

**Stato:** ❌ Aperto  
`getClientIp()` continua ad accettare `x-forwarded-for` / `x-real-ip` senza modello di trusted proxy esplicito. In ambienti non rigidamente configurati, questo rimane spoofabile.

**Azione consigliata (P0):**

- introdurre `getTrustedClientIp(headers, env)` con trust esplicito (es. `cf-connecting-ip` solo se traffico passa da Cloudflare),
- fallback a `unknown` quando non c’è un header trusted,
- test anti-spoof dedicati.

### 2) [SECURITY/RELIABILITY] RateLimiter process-local

**Stato:** ❌ Aperto  
Il `RateLimiter` usa ancora `Map` in-memory. In multi-instance non garantisce enforcement coerente.

**Azione consigliata (P0):**

- introdurre interfaccia `RateLimitStore` (memory + Redis/Upstash),
- usare store distribuito almeno per endpoint pubblici/API/auth,
- esporre `Retry-After` e (opzionale) header `X-RateLimit-*`.

### 3) [BUG] UUID non validato su `/api/v1/receipts/[id]`

**Stato:** ✅ Risolto  
Presente validazione `isValidUuid(id)` con `400` prima della query.

### 4) [BUG] UUID non validato su route PDF autenticata

**Stato:** ✅ Risolto  
`/api/documents/[documentId]/pdf` valida `documentId` prima del DB.

### 5) [BUG/ROBUSTNESS] Logout AdE non garantito in errore

**Stato:** ✅ Risolto  
Nei servizi AdE principali c’è `try/finally` con `logout` best effort.

### 6) [BUG/COMPLIANCE] Signup non atomica (Auth vs profiles)

**Stato:** ✅ Risolto (con compensazione)  
In caso di errore insert `profiles`, viene tentata delete utente Auth via admin API.

### 7) [BUG/ACCOUNT-LIFECYCLE] Delete account non atomica

**Stato:** 🟡 Parziale  
È stato chiarito il comportamento e migliorata la sequenza (sign-out prima della delete Auth), ma resta possibile orfano Auth se delete admin fallisce.

**Azione consigliata (P1):**

- outbox/retry job per `auth.admin.deleteUser`,
- metrica/alert su orphan count,
- guard centralizzata “user autenticato senza profile”.

### 8) [RELIABILITY/PERFORMANCE] Chiamate AdE senza timeout difensivo

**Stato:** ✅ Risolto  
`RealAdeClient.request()` usa `AbortSignal.timeout(...)` configurabile (`fetchTimeoutMs`).

### 9) [RELIABILITY] Fire-and-forget DB update senza `.catch`

**Stato:** ✅ Risolto  
`authenticateApiKey()` ora usa `.catch(...)` con warning logger.

### 10) [BUG] Domain routing fragile su `Host` con porta

**Stato:** ✅ Risolto  
In `proxy.ts` host normalizzato con strip della porta.

### 11) [PERFORMANCE] Doppio fetch DB ricevuta pubblica

**Stato:** ✅ Risolto  
`fetchPublicReceipt` è wrapped in `cache()` e deduplica i fetch nello stesso render.

### 12) [PERFORMANCE] Roundtrip query evitabili in path hot

**Stato:** 🟡 Parziale  
Ci sono miglioramenti (join in alcuni endpoint), ma in helper core (`checkBusinessOwnership`, `fetchAdePrerequisites`) persistono query in più step.

**Azione consigliata (P2):**

- unire lookup profile/business/credentials in query helper con join mirate,
- ridurre roundtrip nei flussi cassa/annullo.

### 13) [CI/CD] Deploy da tag senza gate CI green sullo stesso SHA

**Stato:** ✅ Risolto  
Workflow deploy include `check-ci` che verifica i check run sul commit taggato.

### 14) [CI/CD/SECURITY] Audit dipendenze condizionale al diff

**Stato:** ✅ Risolto  
Presente workflow schedulato (`scheduled-audit.yml`) oltre all’audit in CI su cambi rilevanti.

### 15) [ARCHITECTURE] Validazioni duplicate tra route/action/service

**Stato:** 🟡 Parziale  
Migliorata la validazione UUID e alcuni boundary, ma la validazione payload è ancora distribuita/manuale in più route/action.

**Azione consigliata (P2):**

- schemi Zod condivisi per input API/server actions,
- `safeParse` + error model uniforme (`code`, `message`, `details`, `field`).

---

## Nuovi miglioramenti emersi (non nella lista precedente)

### A) [HIGH][BUG] `idempotencyKey` non validata come UUID ai boundary API

**Contesto:**

- `/api/v1/receipts` accetta `idempotencyKey` solo come stringa non vuota,
- `/api/v1/receipts/[id]/void` idem.

**Rischio:**
le colonne DB sono UUID: input non UUID può generare errore DB e 500.

**Fix consigliato (P1):**

- validare `idempotencyKey` con `isValidUuid` prima di chiamare i service,
- test negativi su payload con UUID malformato (expect 400).

### B) [HIGH][CONSISTENCY] Void flow con update non atomici

**Contesto:**
in `voidReceiptForBusiness` lo stato del documento VOID e lo stato del SALE originale sono aggiornati in due query separate.

**Rischio:**
in caso di failure intermedio si può avere `VOID_ACCEPTED` sul documento di annullo ma `SALE` non aggiornato (incoerenza funzionale/reporting).

**Fix consigliato (P1):**

- racchiudere i due update finali in una transaction unica,
- aggiungere test di rollback su errore al secondo update.

### C) [MEDIUM][SECURITY] Possibile open redirect nel reset password

**Contesto:**
`resetPassword` usa `generateLink` e invia `action_link` raw via email.

**Rischio:**
in caso di configurazioni Supabase non rigorose su redirect whitelist, può introdurre link recovery verso host inattesi.

**Fix consigliato (P2):**

- costruire esplicitamente `redirectTo` verso dominio applicativo noto,
- validare host del link prima dell’invio,
- aggiungere test su dominio atteso.

---

## Priorità operative suggerite

### Sprint immediato (P0)

1. Trusted client IP + anti-spoof tests.
2. Rate limiting distribuito + `Retry-After`.

### Sprint breve (P1)

3. Validazione UUID di `idempotencyKey` in tutte le API interessate.
4. Transaction nel commit finale del flow di annullo.
5. Retry affidabile su delete Auth (account deletion).

### Backlog ragionato (P2)

6. Hardening redirect reset-password.
7. Consolidamento validazioni con Zod + error model unico.
8. Query helper ottimizzati per ownership/prerequisiti AdE.

---

## Note finali

- La base complessiva è oggi **significativamente più solida** della versione precedente.
- I principali rischi residui sono concentrati in due aree: **rate limiting** (trust + distribuzione) e **coerenza transazionale su lifecycle/accounting**.
- Dopo i fix P0/P1 suggerisco una mini-review focalizzata solo su:
  - edge di concorrenza,
  - failure injection (DB/AdE timeout/error),
  - test e2e sui flussi critici (emissione, annullo, account delete).
