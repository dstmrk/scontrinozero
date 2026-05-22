---
name: ade-integration
description: Use when working with the Agenzia delle Entrate (AdE) "Documento Commerciale Online" integration — editing files under src/server/ade/, handling Fisconline credential encryption/decryption, rotating ENCRYPTION_KEY via scripts/rotate-encryption-key.ts, reverse-engineering AdE HTTP flows from HAR captures (login_cie.har, ricerca_documento.har, etc.), wiring the RealAdeClient/MockAdeClient adapter for ADE_MODE=real|mock, or debugging production AdE 4xx/5xx errors. Covers why no headless browser is allowed and the diagnostic-logging-first debug pattern.
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

---

## HAR analysis: completezza, non solo ordine

Confrontando il codice contro una HAR capture, controllare esplicitamente che
**ogni request** in HAR sia presente nell'implementazione — non solo che
l'ordine matcha. Una call mancante è più difficile da spottare di una sbagliata.
Cross-reference request-by-request.

### File HAR nel repo

| File                             | Feature                                            | Target                               |
| -------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `dati_doc_commerciale.har`       | Aggiornamento dati business su AdE post-onboarding | rinviato (possibile feature premium) |
| `aggiungi_prodotto_catalogo.har` | Aggiunta prodotto su rubrica AdE                   | v1.7.0                               |
| `modifica_prodotto_catalogo.har` | Modifica prodotto su rubrica AdE                   | v1.7.0                               |
| `elimina_prodotto_catalogo.har`  | Eliminazione prodotto su rubrica AdE               | v1.7.0                               |
| `ricerca_prodotto_catalogo.har`  | Ricerca prodotto su rubrica AdE                    | v1.7.0                               |
| `ricerca_documento.har`          | Ricerca documento su AdE                           | v2.0.0+                              |
| `login_cie.har`                  | CIE login flow                                     | v1.8.0+                              |

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
