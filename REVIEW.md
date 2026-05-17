# REVIEW.md — Code Audit (deep pass, multi-iteration)

## Metodo usato

1. Lettura completa di `PLAN.md` per evitare duplicati già pianificati.
2. Passata #1 focalizzata su: sicurezza API/auth, robustezza middleware, gestione input, performance lato server.
3. Passata #2 focalizzata su: race/abuse patterns e problemi architetturali non coperti dalla prima passata.
4. Passata #3 di conferma: nessun nuovo finding rispetto alla passata #2.

> Nota: ho escluso esplicitamente i temi già presenti in `PLAN.md` (es. TTL link pubblici, limiti Developer API, timeout DB già in rollout, ecc.).

---

## Findings ordinati per priorità

## P1 — [SICUREZZA/ABUSO] Rate limit applicato **dopo** verifica CAPTCHA (consumo risorse esterne prima del blocco)

### Evidenza

Nei flussi auth (`signUp`, `signIn`, `resetPassword`) la sequenza è:

1. `verifyCaptcha(...)` (chiamata HTTP esterna a Cloudflare Turnstile)
2. `checkRateLimit(...)`

Quindi un attaccante può forzare molte richieste e generare comunque traffico esterno verso Turnstile prima che scatti il limite locale per IP.

### Rischio

- **DoS economico/operativo**: incremento chiamate esterne inutili.
- **Amplificazione**: il rate limiter protegge l’azione applicativa finale, ma non il costo della verifica CAPTCHA.
- **Degrado UX**: in condizioni di abuse, latenza maggiore per utenti legittimi.

### Fix richiesto (non ambiguo)

Implementare un **double-gate**:

1. **Pre-limit leggero** prima di `verifyCaptcha` (bucket dedicato tipo `captchaPre:<action>:<ip>`), con soglia più alta del limite auth funzionale.
2. Mantenere il **limite funzionale attuale** dopo `verifyCaptcha` per bloccare brute-force applicativo.
3. Log separati con `errorClass` diverso (`captcha_prelimit` vs `auth_rate_limit`) per osservabilità.
4. Aggiungere test unit per:
   - blocco pre-captcha quando soglia superata;
   - assenza chiamata `fetch` verso Turnstile quando pre-limit fallisce;
   - backward compatibility del limite post-captcha.

---

## P2 — [FUNZIONALITÀ/UX] Perdita del querystring `redirect` nei redirect a `/login` dal middleware

### Evidenza

Nel middleware, quando utente non autenticato accede a route protette, viene impostato:

- `loginUrl.searchParams.set("redirect", pathname)`

`pathname` non include querystring originale. Se la pagina protetta dipende da parametri (es. filtri/stato), l’informazione si perde al login.

### Rischio

- Ritorno post-login incompleto (utente torna alla path ma non allo stato richiesto).
- Possibili regressioni su schermate che usano query params per stato iniziale.

### Fix richiesto (non ambiguo)

1. Usare `pathname + search` invece del solo `pathname` nella valorizzazione di `redirect`.
2. Sanificare/validare comunque il parametro in consumo (solo path relative interne).
3. Aggiungere test middleware per:
   - `/dashboard/storico?from=...&to=...` -> redirect conserva query completa;
   - path senza query resta invariato.

---

## P3 — [ARCHITETTURA/OPERATIVITÀ] `RateLimiter` con `setInterval` permanente senza `unref()`

### Evidenza

`RateLimiter` crea sempre un `setInterval` nel costruttore. In ambienti Node long-running è ok, ma in alcuni contesti (test, job one-shot, script, shutdown) timer referenziato può ritardare l’exit se `destroy()` non viene invocato in tutti i call-site.

### Rischio

- Process exit non immediato in contesti non-server.
- Fragilità test/integration in caso di nuovi moduli che instanziano limiter senza teardown.

### Fix richiesto (non ambiguo)

1. Dopo `setInterval`, invocare `this.cleanupTimer.unref?.()` (safe optional chaining Node).
2. Mantenere invariata la semantica runtime per il container app.
3. Aggiungere test unit dedicato che verifica presenza del comportamento `unref` (mock timer) senza alterare i test esistenti.

---

## Registro passate

- **Passata #1**: trovati P1 + P2.
- **Passata #2**: trovato P3.
- **Passata #3**: nessun finding nuovo rispetto alla passata #2.

Criterio di stop rispettato: la passata X+1 (passata #3) non ha introdotto nuove issue rispetto alla passata X (passata #2).
