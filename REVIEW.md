# REVIEW — Deep audit pre-release (2026-05-15)

## Metodo usato

- Ho confrontato i finding con `PLAN.md` per evitare duplicati già pianificati/fissati.
- Ho eseguito più passate sul codice (security, correctness, performance, architettura, DX/operatività).
- Ho continuato finché la passata successiva non ha prodotto nuovi finding.

## Verifica anti-duplicazione con PLAN.md

I punti sotto **non** risultano già presenti nel backlog/finding già tracciati in `PLAN.md` (inclusa la sezione review v1.2.15).

---

## Passate

### Passata 1 (security/correctness su auth + API pubbliche)

Nuovi finding individuati: **2**

### Passata 2 (performance/operatività su API + observability)

Nuovi finding individuati: **1**

### Passata 3 (ricontrollo completo mirato sulle stesse aree)

Nuovi finding rispetto alla passata 2: **0**

**Stop condition soddisfatta**: passata X+1 senza nuovi finding.

---

## Findings ordinati per priorità

## P1 — Alta priorità

### P1-01 — Verifica Turnstile incompleta: manca validazione `action` (token cross-flow replay)

**Area:** Sicurezza (auth hardening)

**Contesto tecnico**
La funzione `verifyCaptcha` valida `success` e `hostname`, ma non controlla che l’`action` del token sia quella attesa per il flusso corrente (`signup`, `signin`, `reset-password`). In Turnstile, il campo `action` è un controllo importante per evitare che un token valido generato su un form venga riutilizzato su un altro endpoint.

**Rischio**
Un token ottenuto legittimamente su un’azione può essere riusato su un’altra (entro finestra di validità), riducendo isolamento tra flow di autenticazione.

**Fix proposto (senza ambiguità)**

1. Estendere `verifyCaptcha` con parametro `expectedAction: "signup" | "signin" | "reset-password"`.
2. Parsare dalla risposta Turnstile anche `action`.
3. Rifiutare il token se `action !== expectedAction` con log strutturato (`captcha_action_mismatch`).
4. Aggiornare tutte le call site (`signUp`, `signIn`, `resetPassword`) passando l’azione corretta.

**Test richiesti**

- Unit test: `verifyCaptcha` ritorna `false` quando `action` non combacia anche con `success=true` e `hostname` corretto.
- Integration test action-level: login con token `signup` deve fallire; signup con token `signup` deve passare.

---

### P1-02 — Possibile open-redirect indiretto via `NEXT_PUBLIC_APP_URL` non validata nei flussi Stripe

**Area:** Sicurezza/configuration robustness

**Contesto tecnico**
Gli endpoint Stripe costruiscono `success_url`, `cancel_url` e `return_url` concatenando `NEXT_PUBLIC_APP_URL` senza validazione runtime del dominio/scheme.

**Rischio**
In caso di misconfigurazione env (o compromissione pipeline config), l’app può generare sessioni Stripe che redirezionano utenti a domini non fidati dopo checkout/portal. Non è un attacco da input utente diretto, ma è una superficie concreta di supply/config risk.

**Fix proposto (senza ambiguità)**

1. Introdurre helper centralizzato `getTrustedAppUrl()` (es. in `src/lib/stripe.ts` o `src/lib/validation.ts`).
2. Validare:
   - protocollo `https:` in produzione,
   - host in allowlist (`app.scontrinozero.it` + eventuali host espliciti da env dedicata).
3. Se invalido in production: fail-closed con errore 503 + log `critical`.
4. Sostituire uso diretto di `process.env.NEXT_PUBLIC_APP_URL` nei route handler Stripe con helper.

**Test richiesti**

- `NODE_ENV=production` + URL non https → session non creata, 503.
- URL con host non allowlist → 503.
- URL valido → comportamento attuale invariato.

---

## P2 — Priorità media

### P2-01 — Logging IP in chiaro nei rate-limit auth (privacy/PII minimization)

**Area:** Security/privacy operations

**Contesto tecnico**
Nel rate-limit auth vengono loggati warning con `ip` raw. In altre aree del codebase è già presente approccio di hashing/pseudonimizzazione dell’IP.

**Rischio**
Aumenta esposizione PII nei log applicativi e nei sistemi downstream (Sentry, log shipping, retention).

**Fix proposto (senza ambiguità)**

1. Nei log auth sostituire `ip` con `ipHash` usando helper già esistente (`hashIp`).
2. Evitare campi duplicati (`ip` + `ipHash`) nei log di warning/error non indispensabili.
3. Aggiornare test logger/auth eventualmente dipendenti dal payload.

**Test richiesti**

- Test unitario sui punti di log rate-limit: assert presenza `ipHash`, assenza `ip` raw.

---

## Non-finding rilevanti (controllati)

- Nessun nuovo finding aggiuntivo su RLS/schema/migrazioni rispetto a quanto già tracciato.
- Nessun nuovo finding critico su idempotenza API v1 rispetto al piano attuale.
- Nessun nuovo finding su crittografia applicativa oltre ai limiti già documentati in code comments.
