# REVIEW — Analisi codice ScontrinoZero (multi-pass)

## Premessa e metodo

- Ho verificato prima il `PLAN.md` per evitare duplicati con attività già pianificate.
- Ho eseguito una **Passata 1** completa su sicurezza/performance/funzionalità/architettura.
- Ho eseguito una **Passata 2** focalizzata su edge case (redirect, cache, race condition, coerenza transazionale, fallback IP).
- Alla **Passata 2** non sono emerse nuove issue rispetto alla Passata 1: quindi il processo si ferma qui.

### Item già presenti in `PLAN.md` (esclusi dal presente review)

- B1: dedup webhook Stripe.
- B2: paginazione storico/export.
- B3: key rotation zero-downtime.
- B5: TTL/revoca link pubblici.
- B6: enforcement limiti mensili Developer API.

---

## Findings ordinati per priorità

## P1 — [SEC/REL] Cache pubblica ricevute con `react/cache` in libreria condivisa

**Impatto**

`fetchPublicReceipt` è wrappata in `cache(...)` dentro una libreria usata sia dalla pagina pubblica che dalla route PDF pubblica. In contesti non-RSC o in pattern non strettamente request-scoped, questo può introdurre **stale data cross-request** (es. documento annullato/subito modificato ma ancora servito per qualche tempo) e comportamento non deterministico tra deploy/runtime.

**Perché è prioritario**

- Rischio di servire dati non aggiornati su endpoint pubblici (`/r/[documentId]` e `/r/[documentId]/pdf`).
- Rischio funzionale e di affidabilità con possibili implicazioni privacy/compliance (esposizione oltre il dovuto in finestre di inconsistenza).

**Dove**

- `src/lib/receipts/fetch-public-receipt.ts`

**Indicazioni fix (non ambigue per AI agent)**

1. Rimuovere `cache(...)` dalla funzione di data access condivisa.
2. Se serve dedup nello stesso render della pagina pubblica, applicare dedup **a livello pagina** (es. fetch una sola volta e passaggio dati), non a livello libreria globale.
3. Aggiungere test che validi comportamento “fresh read” su chiamate consecutive con stato DB cambiato.
4. Verificare anche la route `/r/[documentId]/pdf` dopo il refactor.

**Acceptance criteria**

- Due chiamate consecutive con update DB in mezzo riflettono il nuovo stato.
- Nessuna regressione nei test existing su public receipt.

---

## P1 — [REL] Race condition in creazione subscription durante checkout

**Impatto**

In `POST /api/stripe/checkout`, se due richieste concorrenti arrivano quando non esiste ancora riga `subscriptions` per l’utente, entrambe possono tentare `insert` su `user_id` unique => una fallisce con errore DB e potenziale `500` lato API.

**Perché è prioritario**

- Errore intermittente in produzione su azione core di monetizzazione.
- UX negativa e possibile duplicazione di tentativi pagamento.

**Dove**

- `src/app/api/stripe/checkout/route.ts`
- `src/db/schema/subscriptions.ts` (vincolo unique su `userId`)

**Indicazioni fix (non ambigue per AI agent)**

1. Sostituire pattern “select then insert” con `INSERT ... ON CONFLICT (user_id) DO UPDATE/NOTHING` atomico.
2. Gestire in modo esplicito il caso di conflitto restituendo stato consistente (mai 500 non gestito).
3. Mantenere idempotenza lato applicativo: stessa risposta funzionale anche in doppio click/concorrenza.
4. Aggiungere test di concorrenza simulata (mock DB) che riproduca il conflitto.

**Acceptance criteria**

- Nessun 500 su richieste parallele per stesso utente.
- Una sola riga `subscriptions` per utente in ogni scenario.

---

## P1 — [REL/ARCH] Aggiornamenti Stripe webhook non transazionali (stato incoerente)

**Impatto**

Nel webhook Stripe, più update correlati (tabella `subscriptions` + tabella `profiles`) avvengono in query separate senza transazione. In caso di errore a metà, si può avere stato parzialmente aggiornato (es. subscription aggiornata ma piano profilo no, o viceversa in altri handler).

**Perché è prioritario**

- Incoerenza nei feature-gate del piano.
- Diagnostica complessa e mismatch tra billing reale e autorizzazioni applicative.

**Dove**

- `src/app/api/stripe/webhook/route.ts` (`syncSubscriptionData`, `customer.subscription.deleted`, altri rami che fanno update multipli)

**Indicazioni fix (non ambigue per AI agent)**

1. Racchiudere update correlati in una transazione DB unica per evento.
2. Rendere esplicito il contratto “all-or-nothing” per ogni tipo evento che tocca più tabelle.
3. Loggare con `event.id`, `event.type`, outcome transazione.
4. Aggiornare test webhook per validare rollback su errore simulato tra primo e secondo update.

**Acceptance criteria**

- Nessuno stato parziale in caso di errore intermedio.
- Test che dimostra rollback transazionale.

---

## P2 — [SEC/AVAIL] Fallback IP a `"unknown"` in produzione crea bucket rate-limit globale

**Impatto**

In produzione, assenza di `CF-Connecting-IP` forza `getClientIp()` a `"unknown"`. Tutte le richieste entrano nello stesso bucket del rate limiter (auth, PDF pubblico, ecc.) causando blocchi di massa e possibile DoS applicativo indiretto in caso di misconfigurazione proxy/CDN.

**Perché è importante**

- Riduce resilienza: singolo attore può saturare bucket condiviso.
- Il comportamento è “fail-safe” per spoofing, ma “fail-bad” per availability.

**Dove**

- `src/lib/get-client-ip.ts`
- Call-site con rate limit (es. `src/server/auth-actions.ts`, `src/app/r/[documentId]/pdf/route.ts`)

**Indicazioni fix (non ambigue per AI agent)**

1. Introdurre modalità esplicita di trust proxy configurabile (es. `TRUST_PROXY_SOURCE=cloudflare|forwarded`).
2. Se header trusted mancante in produzione: rispondere con errore controllato (503 + log strutturato) sulle route critiche rate-limited **oppure** bypass temporaneo del limiter con alert ad alta severità (scelta da policy).
3. Aggiungere metrica/alert per conteggio richieste con IP “untrusted/missing”.
4. Testare scenario “header mancante in production”.

**Acceptance criteria**

- Nessun bucket globale condiviso silenzioso in produzione.
- Misconfigurazioni rete rilevabili rapidamente via alert.

---

## P2 — [PERF] Write amplification su `last_used_at` API key (update ad ogni request)

**Impatto**

`authenticateApiKey` aggiorna `last_used_at` ad ogni richiesta valida. Con volumi medi/alti genera scritture continue non necessarie, lock contention e I/O extra.

**Perché è importante**

- Overhead evitabile su path caldo API.
- Riduce scalabilità verticale del singolo container/DB.

**Dove**

- `src/lib/api-auth.ts`

**Indicazioni fix (non ambigue per AI agent)**

1. Aggiornare `last_used_at` solo se più vecchio di una soglia (es. 5–15 minuti).
2. Spostare update in query condizionale (`WHERE last_used_at IS NULL OR last_used_at < now()-interval`).
3. Mantenere log warning su errore update senza impattare risposta API.
4. Aggiungere test unit per la soglia temporale.

**Acceptance criteria**

- Riduzione netta numero update su carichi burst.
- `last_used_at` resta semanticamente utile (non serve precisione al secondo).

---

## P3 — [ARCH/REL] `saveBusiness` non atomica (update profilo + upsert business separati)

**Impatto**

`saveBusiness` esegue update su `profiles` e poi update/insert su `businesses` in step separati. Errori intermedi possono lasciare stato parziale (profilo aggiornato ma business no).

**Perché è utile intervenire**

- Migliora consistenza del processo onboarding.
- Riduce edge-case di ripetizione form e dati disallineati.

**Dove**

- `src/server/onboarding-actions.ts`

**Indicazioni fix (non ambigue per AI agent)**

1. Avvolgere l’intera operazione in transazione DB.
2. Usare upsert atomico per `businesses` (se supportato dal layer ORM) o lock logico coerente.
3. Aggiungere test che simuli errore dopo update `profiles` e verifichi rollback.

**Acceptance criteria**

- Nessuno stato parziale in caso di eccezioni durante `saveBusiness`.

---

## Esito passate

- **Passata 1**: trovate 6 issue.
- **Passata 2** (focus su redirect/auth/cache/concorrenza): **0 nuove issue**.
- Condizione richiesta soddisfatta: la passata X+1 non introduce nuove issue rispetto a X.
