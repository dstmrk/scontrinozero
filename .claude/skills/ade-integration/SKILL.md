---
name: ade-integration
description: Use when working with the Agenzia delle Entrate (AdE) "Documento Commerciale Online" integration — editing files under src/lib/ade/ or the emit/void/recovery orchestration in src/lib/services/, handling Fisconline credential encryption/decryption, rotating ENCRYPTION_KEY via scripts/rotate-encryption-key.ts, working on the CIE login branch (loginCie federated SAML flow, push polling, the interactive session store in src/lib/ade/interactive-session-store.ts, isCieSessionMissing pre-check and the reauthRequired outcome), reverse-engineering AdE HTTP flows from HAR captures (login_cie.har, ricerca.har, etc. — local-only, gitignored), wiring the RealAdeClient/MockAdeClient adapter for ADE_MODE=real|mock, tuning the stale-pending recovery (getStalePendingThresholdMs, reconcileSaleDocument/reconcileVoidDocument in src/lib/services/ade-recovery.ts), or debugging production AdE 4xx/5xx errors. Covers why no headless browser is allowed and the diagnostic-logging-first debug pattern.
---

# ade-integration — Integrazione Agenzia delle Entrate, mock, debug

## Strategia: integrazione diretta (no API REST, no headless browser)

L'AdE **non espone API REST pubbliche**. La procedura "Documento Commerciale
Online" è un'interfaccia web nel portale Fatture e Corrispettivi.

Approccio:

- Reverse-engineering delle chiamate HTTP che il portale AdE effettua internamente
- L'utente collega il proprio accesso AdE con **Fisconline** (credenziali cifrate,
  mai in chiaro) oppure con **CIE** (login federato + conferma push): due rami
  con semantiche di sessione diverse — vedi la sezione dedicata sotto
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

## Due metodi d'accesso: Fisconline vs CIE (entrambi live)

`ade_credentials.login_method` (`'fisconline' | 'cie'`, migrazione `0027`)
discrimina i due rami. **Non sono simmetrici**, e la differenza non è nel login
ma in **chi può ri-crearlo**:

|                 | **Fisconline**                          | **CIE**                                    |
| --------------- | --------------------------------------- | ------------------------------------------ |
| Segreto         | username + password + PIN cifrati in DB | nessun segreto riusabile lato server       |
| Secondo fattore | nessuno                                 | conferma **push** sull'app CIE ID (umano)  |
| Riuso sessione  | `src/lib/ade/session-cache.ts`          | `src/lib/ade/interactive-session-store.ts` |
| Rinnovo su 401  | **silenzioso** (ri-login col segreto)   | **impossibile** → `AdeReauthRequiredError` |

Entrambi passano da `withAdeSession` (`src/lib/ade/index.ts`), che sceglie lo
store in base a `method`. In `ADE_MODE=mock` non c'è cache: `login`/`loginCie` +
`logout` per operazione, così anche CIE dà un OK immediato in dev/sandbox.

**Regole quando tocchi il ramo CIE:**

1. **Pre-check prima di scrivere il documento.** `isCieSessionMissing(businessId)`
   va chiamato **prima** dell'INSERT del PENDING in emissione/annullo: senza, un
   business da ri-collegare si ritrova un documento PENDING bloccato dallo
   stale-gate dei 30 min anche dopo aver rinnovato. Esito user-facing:
   `{ reauthRequired: true }` → "Ricollegati" in UI, **409** sulla Developer API.
2. **Il TTL dello store NON è la scadenza della sessione AdE.** `DEFAULT_TTL_MS`
   (6h) e `DEFAULT_MAX_ENTRIES` (100, LRU per-business) sono un cap di memoria:
   la scadenza vera la dichiara AdE con un 401 → `AdeSessionExpiredError` →
   tradotto in `AdeReauthRequiredError`. Non inventare una scadenza logica lato
   nostro, e non "riprovare" un login CIE dal server: il secondo fattore è umano.
3. **Store in-process, single container** (coerente con l'architettura): un
   deploy/restart perde le sessioni interattive e l'utente ri-collega. È
   accettato, non un bug — ma va ricordato quando si valuta lo scaling.
4. **Redirect federati solo dentro l'allowlist.** Il flusso SAML CIE segue
   redirect verso host IdP: passano tutti da `resolveAdeRedirect` contro
   `FEDERATED_ALLOWED_HOSTS` (`src/lib/ade/real-client.ts`). Un host nuovo va
   aggiunto **esplicitamente** all'allowlist, mai seguito perché "arriva da AdE"
   (anti open-redirect).
5. **Finestra di polling push:** 12 × 7000 ms ≈ 84 s (`cieMaxPolls` /
   `ciePollIntervalMs`), scelta per stare **sotto** il taglio ~100 s del proxy
   Cloudflare (errore 524). Se allunghi l'attesa, il gate reale è quello, non AdE.
   Il ramo SPID (`spidMaxPolls`, 30 poll) è implementato e testato ma **non ha
   chiamanti**: SPID resta precluso alla PWA (vedi `PLAN.md`).

Il socket keep-alive morto (sezione sotto) colpisce **soprattutto qui**: i gap
di 7 s tra un poll e l'altro superano il keep-alive dei server IdP.

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

### Failure mode noto: dato del cedente non normalizzato (`EF0`)

`{"esito": false, "errori": [{"codice": "EF0", "descrizione": "'<Campo>' non valido"}]}`
= l'AdE ha rifiutato un campo del cedente/prestatore, non il documento. È un
errore d'**input utente** (regola 20: `warn`, non issue Sentry), ma permanente:
ogni emissione continua a fallire finché il dato in DB non viene corretto.

`buildCedenteFromBusiness` (`src/lib/ade/mapper.ts`) inoltra i campi di
`businesses` **verbatim**, quindi l'AdE valida ciò che abbiamo salvato. Caso
reale: `province = "na"` minuscolo → `EF0 'Provincia' non valido` su tutti gli
scontrini di un'attività, per settimane, senza che nulla nel codice fosse
rotto. L'AdE vuole la sigla maiuscola.

Regola generale: **ogni campo che finisce verbatim in un payload AdE va
normalizzato alla scrittura**, non a read-time nel mapper. Il mapper resta
puro (un solo punto di verità: quello che c'è in DB è già nel formato AdE);
normalizzano le server action che scrivono `businesses` — `saveBusiness`
(onboarding) e `updateBusiness` (settings), entrambe via `normalizeProvince`
in `src/lib/validation.ts`. Aggiungendo un campo al cedente, chiedersi
sempre: che formato pretende l'AdE, e chi lo garantisce alla scrittura?

Diagnosi: la risposta AdE è persistita in `commercial_documents.ade_response`,
quindi un `SELECT` sui documenti `REJECTED` di un business dà il codice e il
campo esatti senza toccare i log.

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
| `login_cie.har`                  | CIE login flow                                     | ✅ **spedito in v1.5.0** — `loginCie` in `src/lib/ade/real-client.ts` (sezione "Due metodi d'accesso")       |

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

I segreti AdE sono cifrati con AES-256-GCM; la chiave sta in `ENCRYPTION_KEY`
(env var, 64 hex chars). Quali campi siano valorizzati dipende da
`login_method` (`src/db/schema/ade-credentials.ts`): Fisconline usa
`encrypted_codice_fiscale` + `encrypted_password` + `encrypted_pin`, CIE
`encrypted_username` + `encrypted_password` — la rotazione li tocca **tutti**
(regola "key_version è per riga", skill `security-patterns`). Se compromessa o
da ruotare:

### Runbook zero-downtime in tre fasi

L'app costruisce la key map di `decrypt()` con **`getEncryptionKeys()`**
(`src/lib/crypto.ts`), che tiene in memoria la chiave corrente **più** quella
precedente opzionale: durante la rotazione righe a v1 e righe a v2 sono
entrambe leggibili, quindi non serve alcuna finestra di fermo.

**Fase 1 — deploy con entrambe le chiavi in env:**

```bash
ENCRYPTION_KEY=<NUOVA_64_HEX>            ENCRYPTION_KEY_VERSION=<NUOVA>
ENCRYPTION_KEY_PREVIOUS=<VECCHIA_64_HEX> ENCRYPTION_KEY_PREVIOUS_VERSION=<VECCHIA>
```

Da qui le nuove scritture nascono già alla versione nuova. Smoke post-deploy
(regola 25) **prima** di procedere: una config a metà (`ENCRYPTION_KEY_PREVIOUS`
senza la sua `_VERSION`, o le due versioni uguali, o la stessa chiave in
entrambe) fa fallire `getEncryptionKeys()` con messaggio esplicito.

**Fase 2 — ri-cifrare le righe rimaste indietro** (ad app accesa):

```bash
npx tsx scripts/rotate-encryption-key.ts \
  --old-key  $ENCRYPTION_KEY_PREVIOUS \
  --old-version $ENCRYPTION_KEY_PREVIOUS_VERSION \
  --new-key  <NUOVA_64_HEX> \
  --new-version <NUOVA_VERSIONE>
```

Lo script legge tutti i record `ade_credentials`, decifra con la vecchia chiave,
ri-cifra con la nuova, aggiorna `key_version`, il tutto in `db.transaction()`
(atomico). È **idempotente**: salta le righe già alla nuova versione, quindi è
ri-eseguibile. Ripetere finché `Rotated: 0, Skipped: <tutte>`.

**Fase 3 — rimuovere `ENCRYPTION_KEY_PREVIOUS*` dall'env e ri-deployare.** Mai
prima della fase 2 completa: una riga ancora a v1 senza chiave v1 in env fa
fallire `decrypt()` con `Unknown key version: 1` (errore esplicito, non dato
corrotto — ma le credenziali di quel business restano inutilizzabili).

**Rollback (fasi 1-2):** invertire le due env (vecchia come `ENCRYPTION_KEY`,
nuova come `ENCRYPTION_KEY_PREVIOUS`) e ri-eseguire lo script a parti invertite.

### Generare una nuova chiave

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
