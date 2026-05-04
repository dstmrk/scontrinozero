# REVIEW — Audit multi-pass (sicurezza, performance, funzionalità, architettura)

Data audit: 2026-05-04

Metodo:

- Ho verificato prima `PLAN.md` per evitare duplicati con backlog/release già pianificate.
- Ho eseguito una passata iniziale trasversale (auth, API, middleware, config, logging, crypto).
- Ho eseguito una seconda passata focalizzata su edge-case e hardening operativo.
- Alla passata 2 non sono emerse nuove issue rispetto alla passata 1 ⇒ stop del ciclo (criterio X+1 soddisfatto).

> Nota di scope richiesta: non considero un problema l'uso di rate limiter in-memory in produzione single-docker.

---

## Verifica anti-duplicato rispetto a `PLAN.md`

Esclusi intenzionalmente dal presente review perché già tracciati nel piano:

- TTL/revoca link pubblici scontrini (B5)
- Enforcement limiti mensili Developer API (B6)
- Stale PENDING recovery (B7)
- CAPTCHA hostname allowlist multi-ambiente (B8)
- Key rotation zero-downtime (B3)

---

## Findings ordinati per priorità

## P0 — Critico

### P0-01 — Mancano security headers baseline (CSP/HSTS/X-Frame-Options/Referrer-Policy)

**Categoria:** Sicurezza / hardening edge web

**Evidenza tecnica:**
In `next.config.ts` vengono impostati header CORS per `/api/*`, ma non risultano header di sicurezza globali (es. `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).

**Rischio:**

- Aumento superficie su XSS riflesso/stored (CSP assente).
- Clickjacking su pagine app/marketing (frame embedding non bloccato).
- Downgrade attack (assenza HSTS in produzione HTTPS).
- Leakage eccessivo di referrer verso terze parti.

**Fix richiesto (non ambiguo):**

1. Definire un set minimo di security headers in `next.config.ts` per tutte le route HTML.
2. Applicare CSP inizialmente in modalità report-only per 1 release, poi enforce.
3. Impostare HSTS solo in production e solo su host HTTPS reali.
4. Aggiungere test automatici sugli header (route representative: `/`, `/dashboard`, `/api/health`).

**Acceptance criteria:**

- Response include almeno: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (o CSP frame-ancestors), `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (prod).
- CSP documentata con eccezioni minime necessarie (Sentry, assets, eventuali inline script hashed/nonce).

---

## P1 — Alta

### P1-01 — `hostnameRedirect` si basa su `Host` header raw senza trusted proxy strategy esplicita

**Categoria:** Sicurezza / routing

**Evidenza tecnica:**
`src/proxy.ts` usa `request.headers.get("host")` per decidere redirect cross-domain.

**Rischio:**
In ambienti con reverse proxy multipli o forwarding non rigidamente validato, un Host header manipolato può innescare redirect inattesi o comportamenti anomali di routing.

**Fix richiesto:**

1. Basare il controllo dominio su `request.nextUrl.hostname` come fonte primaria.
2. Tenere `Host` solo come fallback diagnostico.
3. Introdurre allowlist esplicita dei domini consentiti (`APP`, `MARKETING`, `API`) con fallback safe-deny (no redirect se host sconosciuto).
4. Aggiungere test unit/integration su host spoofed e host con porta.

**Acceptance criteria:**

- Per host non in allowlist, nessun redirect cross-domain implicito.
- Suite test copre casi `www`, porta, host inatteso.

---

### P1-02 — Mancanza di timeout applicativi espliciti su query DB critiche (degrado resilienza)

**Categoria:** Performance / affidabilità

**Evidenza tecnica:**
In route ad alta rilevanza (`/api/v1/receipts`, endpoint PDF, auth actions), query e sequenze DB non mostrano timeout/circuit breaker applicativo.

**Rischio:**
In caso di saturazione DB o lock anomali, le richieste possono restare pendenti troppo a lungo, aumentando coda e timeout a cascata.

**Fix richiesto:**

1. Introdurre timeout per operazioni DB critiche (pattern wrapper con `AbortSignal.timeout` dove compatibile o timeout a livello driver/pool).
2. Mappare timeout a errore applicativo coerente (503 retryable su API pubbliche).
3. Tracciare metrica durata query e conteggio timeout.

**Acceptance criteria:**

- Nessuna route critica resta senza budget di latenza massimo configurabile.
- Timeout distinguibili nei log da errori logici.

---

### P1-03 — API v1 receipts list: possibile costo elevato da `COUNT(*)` completo ad ogni pagina

**Categoria:** Performance / scalabilità

**Evidenza tecnica:**
`src/app/api/v1/receipts/route.ts` esegue `count()` full-match a ogni chiamata GET paginata.

**Rischio:**
Con crescita dati tenant, `COUNT(*)` ripetuto può diventare la parte dominante della latenza.

**Fix richiesto:**

1. Rendere `total` opzionale (`includeTotal=true`) oppure calcolarlo solo a `page=1`.
2. In alternativa, usare strategia `limit+1` per `hasNextPage` senza count totale.
3. Aggiungere benchmark test con dataset ampio (tenant sintetico).

**Acceptance criteria:**

- Path default listing non dipende da full count per funzionare.
- `hasNextPage` corretto anche senza totale.

---

### P1-04 — Logging auth: perdita di segnale diagnostico su tentativi falliti (osservabilità ridotta)

**Categoria:** Operatività / incident response

**Evidenza tecnica:**
In `signIn`, su errore viene loggato solo `"signIn failed"` senza contesto minimo strutturato (es. requestId, reason class, throttled/not).

**Rischio:**
Difficoltà nel distinguere bruteforce, credenziali errate massiva, outage provider auth, regressioni deploy.

**Fix richiesto:**

1. Log strutturato con campi safe: `action`, `requestId`, `ipHash` (non IP raw), `errorClass`.
2. Evitare dati sensibili; riusare sanitizzazione esistente.
3. Aggiungere contatori metrici (failed_login_total, captcha_failed_total).

**Acceptance criteria:**

- Ogni failure auth produce evento machine-readable senza PII.
- Dashboard base permette separare errori utente vs errori sistema.

---

## P2 — Media

### P2-01 — Duplicazione logica parsing body con limite (`readJsonWithLimit` / `readTextWithLimit`)

**Categoria:** Architettura / manutenibilità

**Evidenza tecnica:**
`src/lib/request-utils.ts` contiene due implementazioni quasi identiche del reader streaming.

**Rischio:**
Bugfix futuri applicati a una sola funzione; maggiore costo manutenzione.

**Fix richiesto:**

1. Estrarre primitive unica `readBodyWithLimit(req,maxBytes)` che ritorna `Uint8Array`.
2. Costruire sopra wrapper JSON/TEXT minimali.
3. Riallineare test per coprire una sola path critica.

**Acceptance criteria:**

- Nessuna duplicazione di loop `reader.read()`.
- Coverage invariata o superiore.

---

### P2-02 — Health endpoint troppo minimale per use-case operativi reali

**Categoria:** Funzionalità / operabilità

**Evidenza tecnica:**
`/api/health` restituisce solo `status` + `timestamp` senza check dipendenze minime.

**Rischio:**
False positive di “healthy” mentre DB/Supabase sono degradati.

**Fix richiesto:**

1. Distinguere `liveness` (`/api/health/live`) e `readiness` (`/api/health/ready`).
2. `ready` deve testare almeno connettività DB (query lightweight) e opzionalmente Supabase.
3. Definire timeout breve e risposta con dettaglio sintetico per orchestrazione.

**Acceptance criteria:**

- Docker/orchestrator può usare `live` per restart loop e `ready` per traffico.
- In caso DB down, `ready` != 200.

---

### P2-03 — Validazione captcha incompleta rispetto ai campi di verifica disponibili

**Categoria:** Sicurezza applicativa

**Evidenza tecnica:**
`verifyCaptcha()` valida `success` + `hostname`; non usa `action`/`cdata` né `remoteip`.

**Rischio:**
Minor robustezza contro replay/token misuse cross-form in scenari avanzati.

**Fix richiesto:**

1. Inviare `remoteip` (se disponibile) alla verify API.
2. Validare `action` atteso per form (`signup`, ecc.) quando configurato.
3. Loggare mismatch come evento security (senza token raw).

**Acceptance criteria:**

- Token validi ma con action inattesa vengono rifiutati.
- Test coprono mismatch action e hostname.

---

## Passate eseguite

### Passata 1

Aree analizzate: auth server actions, API v1 receipts, middleware/proxy, next config, logger, crypto, endpoint pubblici PDF, request utilities.
Nuove issue trovate: P0-01, P1-01, P1-02, P1-03, P1-04, P2-01, P2-02, P2-03.

### Passata 2

Riesame completo delle stesse aree + controllo anti-duplicato con `PLAN.md` backlog.
Nuove issue trovate: nessuna.

**Conclusione:** criterio richiesto soddisfatto (passata X+1 senza nuove issue rispetto a X).
