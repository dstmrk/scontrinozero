# REVIEW — Analisi approfondita codice (sicurezza, performance, funzionalità, architettura)

Data analisi: 2026-04-08
Scope prioritario: API nuove (`/api/v1/*`, servizi receipt/void, auth API key, helper condivisi).

## Metodo usato

Ho eseguito passate iterative sul codice, con deduplica rispetto a `PLAN.md`.

- **Passata 1**: review completa delle route API v1 + helper + servizi di business.
- **Passata 2**: review dei moduli adiacenti (auth API key, request parsing/limits, route Stripe/API correlate) per intercettare problemi sistemici.
- **Passata 3 (X+1)**: ricontrollo mirato dei punti già analizzati per cercare issue nuove.
- **Esito arresto**: in passata 3 **non sono emerse nuove issue** rispetto alla passata 2.

## Esclusioni esplicite (già presenti in PLAN.md)

Le seguenti aree NON sono riportate come finding perché già pianificate in `PLAN.md`:

- dedup webhook Stripe su `event.id` (B1)
- paginazione storico/export (B2)
- key rotation runbook (B3)
- error envelope uniforme API (B4)
- TTL/revoca link pubblici (B5)
- enforcement limiti mensili Developer API (B6)
- recovery stale PENDING su idempotenza receipt (B7)
- allowlist multipla hostname CAPTCHA (B8)

---

## Findings ordinati per priorità

## P0 — Critico

### P0-01 — Data fiscale calcolata in UTC invece che timezone fiscale locale (rischio incoerenza legale/documentale)

**Area:** funzionalità + compliance fiscale

**Evidenza tecnica**

- Emissione vendita: la data inviata ad AdE è derivata da `new Date().toISOString().split("T")[0]`.
- Annullamento: data documento originale derivata da `saleDoc.createdAt.toISOString().split("T")[0]`.

Entrambe le operazioni usano UTC implicito. Vicino alla mezzanotte locale (Europa/Roma), il giorno può slittare rispetto alla data fiscale attesa.

**Impatto**

- Possibile data documento errata su AdE in finestre orarie critiche.
- Incoerenze tra documento fiscale, reporting giornaliero e aspettative utente.
- Rischio compliance (anche se intermittente).

**Fix richiesto (non ambiguo)**

1. Introdurre utility centralizzata `getFiscalDate({ tz: "Europe/Rome" })` che ritorni `YYYY-MM-DD` in timezone esplicita.
2. Usare tale utility in:
   - creazione payload SALE
   - payload VOID quando si compone `originalDocument.date`
3. Coprire con test di confine su timestamp prossimi a mezzanotte UTC/local.

**Acceptance criteria**

- Con clock forzato su istanti limite, la data inviata ad AdE coincide sempre con il giorno in `Europe/Rome`.
- Nessun uso residuo di `toISOString().split("T")[0]` nei path fiscali.

---

## P1 — Alto

### P1-01 — CORS incompleto sulle API v1: preflight OK ma response reali senza header CORS

**Area:** funzionalità API / integrazioni client-side

**Evidenza tecnica**

- Esiste handler `OPTIONS` con header CORS.
- Le response `GET/POST` delle route v1 non includono `Access-Control-Allow-Origin`.

Per chiamate browser cross-origin, la preflight può passare ma la response finale viene bloccata dal browser in assenza di ACAO.

**Impatto**

- Integrazioni front-end terze parti non funzionanti/non affidabili.
- Diagnostica difficile lato cliente (“CORS error” generico).

**Fix richiesto (non ambiguo)**

1. Definire helper unico `withApiCors(response)` che aggiunga CORS headers anche alle response applicative (successo + errore).
2. Applicarlo a tutte le route `/api/v1/*`.
3. Aggiungere test route-level che verifichino ACAO su `200/201/4xx/5xx`, non solo su `OPTIONS`.

**Acceptance criteria**

- Ogni risposta delle route v1 (non solo preflight) contiene header CORS coerenti.
- Test automatici coprono almeno un endpoint per metodo (GET, POST).

---

### P1-02 — Nessuna validazione di formato/lunghezza API key prima del lookup DB (amplifica traffico malevolo)

**Area:** sicurezza + performance

**Evidenza tecnica**

- `authenticateApiKey()` effettua hash + query DB per qualunque stringa dopo `Bearer `, senza validare struttura (`szk_live_` / `szk_mgmt_`) e lunghezza attesa.
- Nel progetto esistono utility di validazione formato (`isValidApiKeyFormat`) non usate nel path auth.

**Impatto**

- Ogni token garbage genera comunque lavoro CPU+DB.
- Superficie DoS applicativo aumentata (specie in assenza di rate-limit globale edge).

**Fix richiesto (non ambiguo)**

1. Aggiungere pre-check sincrono in `authenticateApiKey()`:
   - prefisso ammesso
   - lunghezza totale attesa
   - set caratteri body key compatibile con `base64url`
2. In caso di mismatch, ritornare `401` immediato senza query DB.
3. Aggiungere test per token invalidi (prefisso errato, lunghezza eccessiva, charset invalido) verificando che il DB mock non venga chiamato.

**Acceptance criteria**

- Input non conforme non esegue query DB.
- Compatibilità mantenuta con chiavi legacy valide.

---

### P1-03 — `revokeApiKey` non segnala “not found / non autorizzata” (silent failure)

**Area:** funzionalità + DX

**Evidenza tecnica**

- L’update su `api_keys` è eseguito con filtro ownership, ma il risultato non viene controllato.
- La funzione ritorna sempre `{}` anche quando nessuna riga è stata aggiornata.

**Impatto**

- UI/automazioni credono di aver revocato una chiave che in realtà resta attiva.
- Possibile mismatch di sicurezza operativa (chiavi ritenute disabilitate ma ancora valide).

**Fix richiesto (non ambiguo)**

1. Leggere `rowCount`/`returning` dell’update.
2. Se zero righe: tornare errore esplicito (`Chiave non trovata o non autorizzata`).
3. Aggiornare i test server action per coprire caso negativo.

**Acceptance criteria**

- Revoca fallita è distinguibile in modo machine-readable.
- UI può mostrare feedback corretto e bloccare false conferme.

---

## P2 — Medio

### P2-01 — Logica soglia codice lotteria usa floating-point raw (possibile falso negativo su minimo €1)

**Area:** correttezza funzionale

**Evidenza tecnica**

- Il check `total < 1` somma `grossUnitPrice * quantity` in floating point senza normalizzazione monetaria.

**Impatto**

- In casi limite di rappresentazione IEEE-754, un totale concettualmente €1,00 può risultare `0.999999...` e venire rifiutato.

**Fix richiesto (non ambiguo)**

1. Calcolare il totale in centesimi/millesimi con aritmetica intera coerente ai vincoli attuali (`price` 2 decimali, `quantity` 3 decimali).
2. Confrontare la soglia lotteria su valore normalizzato.
3. Aggiungere test con casi noti FP edge.

**Acceptance criteria**

- Nessun rifiuto spurio per importi validi a €1,00.
- Coerenza tra check lotteria e totale inviato nel payload pagamenti.

---

### P2-02 — Mancano header `Retry-After` nelle risposte 429 delle API

**Area:** UX API / robustezza integrazione

**Evidenza tecnica**

- I limiter restituiscono `resetAt`, ma le response 429 espongono solo messaggio testuale.

**Impatto**

- Client API non possono implementare backoff preciso e deterministico.
- Aumento di retry aggressivi e carico non necessario.

**Fix richiesto (non ambiguo)**

1. Estendere helper rate limit per restituire anche `resetAt`.
2. Popolare header HTTP `Retry-After` (secondi) e opzionalmente payload machine-readable.
3. Coprire con test unitari helper + test route.

**Acceptance criteria**

- Ogni 429 include `Retry-After` coerente con finestra attiva.
- Client sample può fare retry automatico senza parsing messaggi testuali.

---

## Note finali per il prossimo agente che implementa i fix

- Procedere **in ordine di priorità** (P0 → P1 → P2).
- Mantenere compatibilità retro con payload API esistenti salvo dove esplicitamente indicato.
- Aggiornare test **prima** dell’implementazione (coerente con approccio TDD del repo).
