# REVIEW — Codebase audit approfondito (multi-pass)

## Metodo usato

1. Ho letto `PLAN.md` per evitare duplicati con improvement già pianificati/completati.
2. Ho eseguito una **Passata 1** sulle aree critiche (auth, webhook, API v1, services, onboarding, billing).
3. Ho eseguito una **Passata 2** focalizzata su edge-case funzionali (date/timezone, race condition residue, consistency dei flag di verifica).
4. Ho eseguito una **Passata 3** di controllo incrociato (test e file restanti sensibili): **nessuna nuova issue** rispetto alla passata 2.

Stop condition raggiunta: passata X+1 senza nuovi finding.

---

## Verifica anti-duplicazione con `PLAN.md`

I finding sotto **non** duplicano i punti già presenti in `PLAN.md` (es. B2 export pagination, B5 TTL link pubblici, B8 Turnstile hostname allowlist, B9 recovery claim webhook Stripe, ecc.).

---

## Findings prioritizzati

## P0 — [SECURITY/RELIABILITY] Webhook Stripe senza limite dimensione body (DoS memory/CPU)

**Gravità:** Critica  
**Area:** `src/app/api/stripe/webhook/route.ts`

### Problema

La route webhook legge sempre il body intero con `await req.text()` prima della verifica firma. Un body molto grande può saturare memoria/CPU del singolo container (anche se la firma poi fallisce).

### Perché è importante

- Endpoint pubblico esposto su Internet.
- In ambiente single-container un attacco di oversized payload può degradare tutto il servizio.
- Il fix è “cheap” e a forte riduzione rischio.

### Evidenza tecnica

- Lettura raw body non limitata: `payload = await req.text()`.
- In altre route esiste già un pattern safe con `readJsonWithLimit`, ma qui manca un equivalente raw-text.

### Fix richiesto (non ambiguo)

1. Introdurre helper generico `readTextWithLimit(req, maxBytes)` con doppia difesa:
   - controllo `content-length` (fast fail),
   - lettura stream chunk-by-chunk con stop oltre soglia.
2. Applicare alla route webhook prima di `constructEvent`.
3. Soglia raccomandata: **256 KB** (sufficiente per payload Stripe standard con margine).
4. In caso superamento limite: ritorno `413 Payload too large` (senza dettaglio interno).
5. Aggiornare test webhook:
   - body > limite => 413,
   - body entro limite e firma valida => comportamento invariato.

### Criteri di accettazione

- Nessuna allocazione integrale del body oltre la soglia.
- Tutti i test webhook esistenti verdi + nuovi test “oversized payload”.

---

## P1 — [CONSISTENCY/RACE] `createApiKey` può superare il limite piano in concorrenza

**Gravità:** Alta  
**Area:** `src/server/api-key-actions.ts`

### Problema

Il flusso fa `count(active keys)` e poi `insert` in due step separati, senza lock/serializzazione per business. Due richieste concorrenti possono entrambe vedere count sotto soglia e inserire, violando il limite del piano.

### Perché è importante

- È un bypass di policy commerciale/prodotto.
- Impatta billing/entitlement e può diventare difficile da correggere retroattivamente.

### Evidenza tecnica

- Check limite via query `count()` seguito da `insert` fuori da transazione serializzata.

### Fix richiesto (non ambiguo)

Implementare controllo+insert atomico per `businessId`:

**Opzione consigliata (semplice e robusta):**

1. Aprire transazione DB.
2. Acquisire lock per business (es. `pg_advisory_xact_lock(hashtext(businessId))` oppure lock row business/profile).
3. Rifare `count(active)` dentro transazione.
4. Se oltre soglia => errore business.
5. Se ok => insert API key nella stessa transazione.

### Test da aggiungere

- Test di concorrenza (2+ create parallele al bordo limite) che dimostri:
  - prima del fix: possibile overflow,
  - dopo il fix: massimo rispettato sempre.

### Criteri di accettazione

- In qualunque concorrenza il numero di chiavi attive non supera il limite piano.

---

## P1 — [FUNCTIONAL/UX] `searchReceipts` non valida range invertito `dateFrom > dateTo`

**Gravità:** Alta  
**Area:** `src/server/storico-actions.ts`

### Problema

Le date vengono validate singolarmente ma non viene fatto fail-fast quando `dateFrom` è successiva a `dateTo`. In quel caso la query torna vuota, mascherando un errore input come “nessun dato”.

### Perché è importante

- Comportamento ambiguo per UI/operatori.
- Incoerente con l’API v1 che gestisce esplicitamente range invalidi.

### Fix richiesto (non ambiguo)

1. Dopo parsing di entrambe le date, aggiungere check: `if (dateFrom > dateTo)`.
2. Restituire errore chiaro nel result (`error`) senza query DB.
3. Mantenere output consistente con l’attuale contratto `SearchReceiptsResult`.
4. Allineare copy error message a convenzioni già usate nelle route API.

### Test da aggiungere

- Caso `dateFrom=2026-03-10`, `dateTo=2026-03-01` => errore esplicito, `items=[]`, `total=0`, nessuna query inutile.

### Criteri di accettazione

- Range invertiti non producono più “falsi vuoti”, ma errore deterministico.

---

## P1 — [CONSISTENCY] `verifyAdeCredentials` può marcare `verifiedAt` su credenziali stale

**Gravità:** Alta  
**Area:** `src/server/onboarding-actions.ts`

### Problema

`verifyAdeCredentials` legge credenziali, esegue login AdE, poi aggiorna `verifiedAt` con `where businessId = ...`. Se in parallelo un’altra richiesta aggiorna password/PIN (resettando `verifiedAt`), la verifica “vecchia” può rimettere `verifiedAt` a true su credenziali ormai cambiate.

### Perché è importante

- Rischio stato incoerente: credenziali nuove non realmente verificate ma flag “verified”.
- Può sbloccare flussi operativi con dati non validati.

### Fix richiesto (non ambiguo)

Usare aggiornamento condizionale ottimistico:

1. Durante read iniziale, salvare fingerprint/versione della riga (`id`, `updatedAt` o hash campi cifrati).
2. In update finale di `verifiedAt`, aggiungere condizione su stessa versione letta.
3. Se `rows_affected = 0`, non considerare errore fatale ma restituire messaggio “credenziali cambiate, rieseguire verifica”.
4. Aggiornare log con evento dedicato di race harmless.

### Test da aggiungere

- Scenario concorrente: update credenziali tra read e mark verified => update finale non deve passare.

### Criteri di accettazione

- `verifiedAt` può essere impostato solo sulla stessa versione delle credenziali effettivamente verificate.

---

## P2 — [FUNCTIONAL/FISCAL] Rendering data/ora ricevuta dipende dal timezone server, non da Europe/Rome

**Gravità:** Media  
**Aree:**

- `src/app/r/[documentId]/page.tsx`
- `src/lib/pdf/generate-sale-receipt.ts`

### Problema

Le funzioni `formatDate` usano timezone implicita server (`toLocaleString` senza `timeZone`, oppure `getHours/getDate` locali). In container UTC, l’orario mostrato può differire dall’orario fiscale italiano (Europe/Rome), soprattutto vicino a mezzanotte e durante DST.

### Perché è importante

- Incoerenza tra documento mostrato/stampato e aspettativa fiscale locale.
- Potenziali contestazioni operative (ora scontrino percepita errata).

### Fix richiesto (non ambiguo)

1. Centralizzare formatter data/ora fiscale (`Europe/Rome`) in util condivisa.
2. Aggiornare sia pagina pubblica sia PDF generator per usare sempre timezone esplicito.
3. Evitare API Date locali (`getHours`, `getDate`) senza timezone.

### Test da aggiungere

- Casi attorno a mezzanotte UTC e cambio ora legale/solare, con snapshot expected in `Europe/Rome`.

### Criteri di accettazione

- Data/ora visualizzata coerente e deterministica in tutti gli ambienti runtime.

---

## Note operative

- Non ho inserito finding su rate limiter in-memory, come richiesto (deployment single Docker).
- Non ho reinserito punti già in backlog/plan.
