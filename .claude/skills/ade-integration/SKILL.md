---
name: ade-integration
description: Use when working with the Agenzia delle Entrate (AdE) "Documento Commerciale Online" integration — editing files under src/lib/ade/ or the emit/void/recovery orchestration in src/lib/services/, handling Fisconline credential encryption/decryption, rotating ENCRYPTION_KEY via scripts/rotate-encryption-key.ts, reverse-engineering AdE HTTP flows from HAR captures (login_cie.har, ricerca.har, etc. — local-only, gitignored), wiring the RealAdeClient/MockAdeClient adapter for ADE_MODE=real|mock, tuning the stale-pending recovery (getStalePendingThresholdMs, reconcileSaleDocument/reconcileVoidDocument in src/lib/services/ade-recovery.ts), or debugging production AdE 4xx/5xx errors. Covers why no headless browser is allowed and the diagnostic-logging-first debug pattern.
---

# ade-integration — Integrazione Agenzia delle Entrate, mock, debug

## Strategia: integrazione diretta (no API REST, no headless browser)

L'AdE **non espone API REST pubbliche**. La procedura "Documento Commerciale
Online" è un'interfaccia web nel portale Fatture e Corrispettivi.

Approccio:

- Reverse-engineering delle chiamate HTTP che il portale AdE effettua internamente
- L'utente fornisce le proprie credenziali Fisconline (cifrate, mai in chiaro)
- Il backend replica il flusso con chiamate HTTP dirette (fetch/axios)
- **NO Playwright/headless browser** — troppo pesante per VPS limitata
  (~400MB RAM per Chromium). Solo HTTP leggero.
- **Base legale:** Interpello AdE n. 956-1523/2020 — l'AdE non si oppone ai
  "velocizzatori" purché rispettino le prescrizioni normative

---

## Pattern adapter/strategy per ambiente sandbox

L'integrazione AdE usa `AdeClient` con due implementazioni:

- **`RealAdeClient`** — invia davvero all'AdE (produzione)
- **`MockAdeClient`** — esegue **tutta la logica** (validazione, formattazione,
  preparazione payload) ma si ferma prima dell'invio HTTP, restituendo una
  risposta simulata

Controllato da `ADE_MODE=real|mock` (env var). Il codice in sandbox è
**identico** a quello in produzione, cambia solo l'ultimo step.

---

## Debugging production HTTP flow errors

Quando un errore produzione suggerisce sequenza HTTP sbagliata:

1. Aggiungere diagnostic logging **prima** del fix (phase labels, cookie counts,
   response status)
2. Riprodurre l'errore locale per confermare la root cause
3. Solo allora scrivere il fix

Mai mergiare un fix hypothesis-based senza prima vedere l'evidenza diagnostica.

### Failure mode noto: socket keep-alive morto (`other side closed`)

`AdeNetworkError` con causa `SocketError: other side closed`
(`UND_ERR_SOCKET`) = undici ha riusato un socket keep-alive che il server
aveva già chiuso. Succede sistematicamente nei flussi con attese intrinseche
(CIE/SPID: poll push a 7s, approvazione umana) perché il keep-alive timeout
dei server AdE/IdP è più corto dei gap. Un browser ritenta in automatico su
una connessione fresca; il nostro client lo fa via retry singolo in
`request()` (`isStaleSocketError`, solo GET/HEAD — mai POST: doppio documento
fiscale). Se ricompare su una POST, NON estendere il retry: ragionare con la
semantica unknown-outcome di `submitDocument`/recovery.

Come leggerlo nei log: l'utente vede "portale AdE non raggiungibile" (mapping
`AdeNetworkError`), ma la vera firma è nella catena `caused by` del log
`warn`. Diagnosi rapida di una server action fallita da HAR del **nostro**
frontend: la response `text/x-component` contiene il JSON `{ error }` — da lì
si risale al messaggio in `error-messages.ts` e quindi alla classe d'errore
esatta, prima ancora di aprire i log server.

---

## HAR analysis: completezza, non solo ordine

Confrontando il codice contro una HAR capture, controllare esplicitamente che
**ogni request** in HAR sia presente nell'implementazione — non solo che
l'ordine matcha. Una call mancante è più difficile da spottare di una sbagliata.
Cross-reference request-by-request.

### File HAR (capture locali, NON versionate)

⚠️ I `.har` sono **gitignorati** (`*.har` in `.gitignore`: contengono cookie e
dati di sessione reali): vivono in `har/` solo sulla macchina dell'owner e
**non esistono in un clone fresco** (CI, sessioni cloud). Se un task richiede
una HAR assente, chiederla all'utente — non cercarla nel repo.

| File                             | Feature                                            | Target                                                                                                       |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `dati_doc_commerciale.har`       | Aggiornamento dati business su AdE post-onboarding | rinviato (possibile feature premium)                                                                         |
| `aggiungi_prodotto_catalogo.har` | Aggiunta prodotto su rubrica AdE                   | nice-to-have (sync catalogo AdE)                                                                             |
| `modifica_prodotto_catalogo.har` | Modifica prodotto su rubrica AdE                   | nice-to-have (sync catalogo AdE)                                                                             |
| `elimina_prodotto_catalogo.har`  | Eliminazione prodotto su rubrica AdE               | nice-to-have (sync catalogo AdE)                                                                             |
| `ricerca_prodotto_catalogo.har`  | Ricerca prodotto su rubrica AdE                    | nice-to-have (sync catalogo AdE)                                                                             |
| `ricerca.har`                    | Ricerca documento su AdE                           | ✅ usata dal recovery (riconciliazione, sotto); recupero corrispettivi user-facing rinviato (roadmap v1.9.0) |
| `login_cie.har`                  | CIE login flow                                     | v1.7.0                                                                                                       |

---

## Recovery stale-pending: riconciliazione pre-retry (implementata)

AdE non accetta idempotency-key nel payload: se una `submitSale`/`submitVoid`
era arrivata ad AdE ma la response si è persa (timeout, container kill), un
retry cieco creerebbe un documento fiscale duplicato — **irreversibile**.
Il recovery in `src/lib/services/ade-recovery.ts` chiude questa finestra con
**due strati**, entrambi già in produzione:

1. **Gate di freschezza** — `getStalePendingThresholdMs()`: una row
   PENDING/ERROR entra nel recovery path solo se più vecchia di **30 min**
   (sopra la durata tipica di una sessione AdE; un retry sotto soglia ritorna
   `PENDING_IN_PROGRESS`). Override per test/E2E:
   `STALE_PENDING_THRESHOLD_MINUTES=5`. Soglia condivisa da
   `src/lib/services/receipt-service.ts` e `src/lib/services/void-service.ts`
   per evitare drift. Il claim del documento è un CAS ottimistico su
   `updated_at` (`claimStaleDocument`): serializza retry concorrenti senza
   tenere lock DB durante la HTTP AdE (2-5s).
2. **Riconciliazione pre-retry** — prima di ri-sottomettere, il recovery
   interroga AdE via `searchDocuments` (HAR: `ricerca.har`) e riconcilia con
   `reconcileSaleDocument`/`reconcileVoidDocument`: se AdE aveva già accettato
   → finalize-only (nessun duplicato fiscale); se non trovato → re-submit;
   lookup ambiguo o fallito → resta PENDING (fail-safe). Logging esplicito al
   rientro in recovery senza `adeTransactionId` per audit (REVIEW.md #4,
   ormai risolto — vedi `docs/architecture/data-flows.md`).

Storia: prima della riconciliazione la soglia dei 30 min era l'**unica**
mitigazione e il duplicato restava possibile oltre soglia. Se tocchi questo
flusso, l'invariante da testare è: nessun percorso chiama `submitSale`/
`submitVoid` su un documento che AdE ha già accettato.

---

## Key rotation: `ENCRYPTION_KEY`

Le credenziali Fisconline sono cifrate con AES-256-GCM; la chiave sta in
`ENCRYPTION_KEY` (env var, 64 hex chars). Se compromessa o da ruotare:

### Procedura obbligatoria prima del deploy

**PRIMA di cambiare l'env var sul server**, eseguire la migrazione:

```bash
npx tsx scripts/rotate-encryption-key.ts \
  --old-key  $ENCRYPTION_KEY \
  --old-version $ENCRYPTION_KEY_VERSION \
  --new-key  <NEW_64_HEX_KEY> \
  --new-version <NEW_VERSION>
```

`scripts/rotate-encryption-key.ts`:

- Legge tutti i record `ade_credentials`
- Decifra con la vecchia chiave
- Ricicla con la nuova chiave
- Aggiorna `key_version` nel DB
- Wrappa tutto in `db.transaction()` → atomico

Dopo la migrazione verificare che tutti i record abbiano `key_version = NEW_VERSION`,
poi aggiornare le env var sul server e fare deploy.

**Rollback:** se il deploy fallisce, riportare le env var alla versione precedente —
i record con il vecchio `key_version` sono ancora decifrabili con la vecchia chiave
(presente nell'immagine Docker precedente).

### Generare una nuova chiave

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
