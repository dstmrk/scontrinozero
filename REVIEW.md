# REVIEW — Analisi multi-pass (focus: commit ultimi 7 giorni)

Data analisi: 2026-04-15
Branch: `work`
Scope prioritario: modifiche introdotte tra `2026-04-08` e `2026-04-14`.

## Metodo usato

- Ho ispezionato la history dell’ultima settimana (`git log --since='7 days ago' --name-only`) e analizzato in profondità i file backend/critical path toccati (webhook Stripe, API v1 receipts, server actions, servizi emissione/annullo, auth API key, storico).
- Ho confrontato i finding con il backlog esistente in `PLAN.md` per **evitare duplicati** di improvement già pianificati (es. B9/B10).
- Ho eseguito passate iterative:
  - **Passata 1**: flussi core sicurezza/idempotenza/consistenza.
  - **Passata 2**: edge case di validazione input e scalabilità operativa.
  - **Passata 3**: ricontrollo mirato dei punti ad alto impatto emersi; nessun nuovo finding rispetto alla passata 2.

---

## Findings prioritizzati

## P0 — Critico

### P0-01 — Stripe webhook: race condition reale nel pattern SELECT → handleEvent → INSERT (possibile doppia elaborazione side-effect)

**Area:** `src/app/api/stripe/webhook/route.ts`  
**Tipo:** Consistenza dati / affidabilità pagamenti / idempotenza

#### Problema

Il nuovo pattern evita il bug “evento marcato processed prima del successo”, ma resta vulnerabile a una race concorrente:

1. due delivery parallele dello stesso `event.id` fanno entrambe `SELECT` e non trovano righe;
2. entrambe eseguono `handleEvent(event, stripe)` (side effect duplicati);
3. una sola `INSERT ... onConflictDoNothing()` vince; l’altra viene ignorata.

Quindi la dedup DB avviene **dopo** i side effect e non impedisce doppia applicazione logica.

#### Impatto

- Possibili aggiornamenti doppi o transizioni stato incoerenti su subscription/profile.
- Esito non deterministico sotto retry burst/parallel delivery Stripe.
- Difficile debugging post-mortem perché il dedup table mostrerà un solo evento “processed”.

#### Come riprodurre

- Simulare due richieste concorrenti con stesso payload/signature webhook.
- Verificare che `handleEvent` venga eseguito due volte anche con singola riga finale in `stripe_webhook_events`.

#### Fix consigliato (chiaro per implementazione AI)

- Introdurre **claim atomico pre-processing** dell’evento, ad es. con tabella di lock/stato:
  - `INSERT event_id, status='processing'` con unique su `event_id` prima di `handleEvent`.
  - Solo chi inserisce elabora; gli altri return 200 (duplicate/in-progress).
  - A fine successo: `status='processed'`.
  - In caso errore: rimuovere lock o marcare `failed` con retry policy esplicita.
- In alternativa, lock transazionale forte (ad es. advisory lock su hash(event.id)) prima dei side effect.

#### Criteri di accettazione

- Test unit/integration che inviano webhook duplicati in parallelo e verificano **una sola** esecuzione side effect.
- Nessun doppio update su subscription/profile in condizioni di concorrenza.

---

## P1 — Alto

### P1-01 — `searchReceipts` (server action): validazione data incompleta, input URL malformato può causare errore server

**Area:** `src/server/storico-actions.ts`, chiamata da `src/app/dashboard/storico/page.tsx`  
**Tipo:** Robustezza funzionale / hardening input

#### Problema

`searchReceipts` costruisce direttamente `new Date(params.dateFrom + "T00:00:00.000Z")` e `dateTo` senza validazione formato/validità (es. `2026-99-99`, `abc`). A differenza della route API v1 list, qui manca guard `Invalid Date`.

Poiché `dal`/`al` arrivano dalla URL (`searchParams`), un input malformato può propagare Date non valide nella query DB e causare failure runtime/500.

#### Impatto

- UX degradato (pagina storico in errore su query string invalida).
- Possibile superficie di errore applicativo evitabile con validazione precoce.

#### Fix consigliato

- Aggiungere validazione centralizzata analoga a `/api/v1/receipts`:
  - regex `YYYY-MM-DD` + check `Number.isNaN(date.getTime())`.
  - se invalido: fallback sicuro (ultimi 7 giorni) o errore controllato user-facing.
- Valutare helper condiviso per parsing date range (evita divergenza API vs server action).

#### Criteri di accettazione

- Test unit su `searchReceipts` con date invalide/formati errati.
- Nessun crash server; comportamento deterministico documentato.

---

### P1-02 — `searchReceipts` (server action): `page`/`pageSize` non clampati lato server (rischio query pesanti via payload tamper)

**Area:** `src/server/storico-actions.ts`  
**Tipo:** Performance / abuse-resilience

#### Problema

`page` e soprattutto `pageSize` provengono da `SearchReceiptsParams` e sono usati direttamente in `.limit(pageSize).offset(offset)` senza limiti server-side. Anche se UI passa 10, una chiamata manipolata alla server action può forzare valori enormi.

#### Impatto

- Query DB costose, latenza elevata, consumo memoria/CPU nel singolo container.
- Possibile degrado servizio con richieste ripetute a pageSize alto.

#### Fix consigliato

- Applicare clamp server-side:
  - `page >= 1`
  - `1 <= pageSize <= MAX_PAGE_SIZE` (es. 50 o 100).
- Validare anche `offset` massimo ragionevole (o passare a cursor-based quando opportuno).

#### Criteri di accettazione

- Test con page/pageSize negativi, zero, enormi.
- Query sempre entro limiti definiti.

---

### P1-03 — Cambio password rate limit solo su IP: rischio lockout multi-utente dietro NAT/proxy

**Area:** `src/server/profile-actions.ts` (`changePassword`)  
**Tipo:** Sicurezza disponibilità / UX

#### Problema

Il limiter usa chiave `changePassword:${ip}`. In ambienti con IP condiviso (uffici, carrier NAT, proxy cloud), pochi tentativi falliti di un utente possono bloccare anche altri utenti legittimi.

#### Impatto

- DoS involontario tra utenti sullo stesso IP.
- Support burden (utenti bloccati senza motivo).

#### Fix consigliato

- Usare chiave composita: `changePassword:${user.id}:${ip}` oppure primariamente `user.id` con fallback IP.
- Tenere logging di entrambi i campi (`userId`, `ip`) per audit.

#### Criteri di accettazione

- Test che verifica isolamento tra due utenti con stesso IP.
- Limiter efficace contro brute-force senza lockout cross-account.

---

## P2 — Medio

### P2-01 — Stripe checkout: creazione customer prima del “claim” DB può generare customer orfani in race

**Area:** `src/app/api/stripe/checkout/route.ts`  
**Tipo:** Efficienza operativa / pulizia dati esterni

#### Problema

Nel path senza `stripeCustomerId`, la route crea prima `stripe.customers.create()`, poi tenta insert subscription con `onConflictDoNothing()`. In richieste concorrenti il loser può creare customer Stripe inutilizzato (commentato nel codice come “acceptable orphan”).

#### Impatto

- Accumulo customer Stripe non usati nel tempo.
- Rumore operativo in dashboard Stripe e possibili costi indiretti di gestione.

#### Fix consigliato

- Migliorare sequenza per ridurre orfani:
  - claim DB preventivo (stato “creating_customer”) per utente;
  - solo il vincitore crea customer Stripe;
  - gli altri attendono/riusano record winner.
- In alternativa, cleanup job periodico dei customer orfani marcati localmente.

#### Criteri di accettazione

- Test concorrenti: max 1 customer Stripe creato per utente nel race path.

---

## Miglioramenti NON riportati perché già in PLAN.md

Per evitare duplicazioni col piano corrente, **non** ho reinserito finding già tracciati, in particolare:

- B9: recovery/replay eventi Stripe failed.
- B10: check `rows_affected >= 1` su webhook handler critici.
- B7/B2 e altri backlog già formalizzati.

---

## Esito passate

- **Passata 1:** individuati P0-01, P1-01, P1-02.
- **Passata 2:** aggiunto P1-03 e P2-01.
- **Passata 3:** nessun finding nuovo rispetto alla passata 2 → criterio di arresto soddisfatto.
