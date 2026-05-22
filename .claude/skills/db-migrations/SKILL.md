---
name: db-migrations
description: Use when creating or modifying SQL files under supabase/migrations/, updating Drizzle schema in src/db/schema/, editing supabase/migrations/meta/_journal.json, writing raw sql`` templates that bind Date values, debugging race conditions on UNIQUE constraints, designing per-tenant idempotency keys, or wrapping multi-row updates in db.transaction(). Covers the handwritten migrations workflow (NEVER run `npx drizzle-kit generate` in this repo), ADD COLUMN IF NOT EXISTS pattern, bootstrap on a pre-existing DB via __applied_migrations, and the Date-in-sql`` regression that crashed AdE "Verifica connessione".
---

# db-migrations — Migrazioni handwritten, transazioni, gotchas Drizzle

## DB migrations: TUTTE handwritten dopo lo schema iniziale

⚠️ **Stato reale del repo:** drizzle-kit è stato usato UNA SOLA volta per generare
`0000_initial.sql` + `0000_snapshot.json`. Tutte le migrazioni successive sono
**scritte a mano**. In `supabase/migrations/meta/` esiste UN solo snapshot
(`0000_snapshot.json`), non gli snapshot intermedi.

🚫 **NON ESEGUIRE MAI `npx drizzle-kit generate`** nello stato attuale.
Genererebbe una mega-migrazione che riapplica tutto ciò che è successo dopo `0000`,
confliggendo con le migrazioni handwritten esistenti. Per riattivare drizzle-kit
serve prima un task dedicato di rebuild degli snapshot intermedi (out of scope
finché non diventa pain).

### Workflow obbligatorio per ogni nuova migrazione

1. Crea il file `.sql` in `supabase/migrations/` con naming `NNNN_description.sql`
   (es. `0014_add_signup_source_to_profiles.sql`). Header comment che spiega il "perché".
2. Aggiungi la entry in `supabase/migrations/meta/_journal.json`:
   ```json
   {
     "idx": 14,
     "version": "7",
     "when": <Date.now() in ms>,
     "tag": "0014_add_signup_source_to_profiles",
     "breakpoints": true
   }
   ```
3. Aggiorna il file Drizzle in `src/db/schema/<table>.ts` per riflettere il nuovo
   schema (es. `signupSource: text("signup_source")`). Senza questo, TypeScript
   non vede la colonna e le query falliscono al type check.
4. Esegui `node scripts/check-migrations.mjs` (stesso check gira in CI).
5. Test su DB locale: `npx tsx scripts/migrate.ts` deve applicare la migrazione
   senza errori e idempotentemente al re-run.

**Runtime runner:** `scripts/migrate.ts` legge i `.sql` ordinati per nome, traccia
i file applicati in `__applied_migrations`, wrappa ogni migrazione in transazione.
Non legge il journal — quello è solo per il check CI di completezza.

### Pattern `ALTER TABLE ADD COLUMN`

Usa sempre `ADD COLUMN IF NOT EXISTS` (vedi `0002_add_lottery_code.sql`):

```sql
-- Migration: add <column> to <table>
-- Feature/motivo: <link a issue o release>
ALTER TABLE <table>
  ADD COLUMN IF NOT EXISTS <column> <type>;
```

**Niente `NOT NULL`** su colonne aggiunte a tabelle popolate senza default —
fallisce su righe esistenti. Aggiungi prima nullable, backfill, poi migration
successiva con `ALTER COLUMN SET NOT NULL`.

### Bootstrap su DB pre-esistente

Se il DB è stato inizializzato senza il migration runner (drizzle-kit, Supabase
dashboard, restore), la tabella `__applied_migrations` è vuota e il runner crasha
con "type already exists". Il runner ha rilevamento automatico: se vuota ma
`document_kind` esiste già in `pg_type`, marca tutte le migrazioni come applicate.

Fix manuale di emergenza:

```sql
INSERT INTO __applied_migrations (filename, checksum)
SELECT unnest(ARRAY[
  -- elencare qui i nomi dei file .sql in supabase/migrations/ già presenti nel DB
]), '' ON CONFLICT (filename) DO NOTHING;
```

⚠️ **Inserire SOLO le migrazioni effettivamente presenti nel DB.** Marcare come
applicate migrazioni non eseguite = schema silenziosamente incompleto. Verificare
con SQL editor Supabase o via MCP prima di inserirle.

---

## Transazioni multi-document = correttezza, non ottimizzazione

Operazioni che aggiornano 2+ record DB che devono restare consistenti
(es. void flow: VOID + mark SALE come VOID_ACCEPTED) **devono** essere
wrappate in `db.transaction()` da subito. Mid-operation failure senza transazione
= stato inconsistente silenzioso, difficile da rilevare e doloroso da riparare.

Esempi nel codice: `void-service.ts`, `receipt-service.ts`.

---

## Drizzle raw `sql\`\`` templates: `Date` va pre-serializzato

Dentro `db.update().set({...})` e `eq(col, value)` Drizzle conosce il tipo della
colonna e converte JS value nel formato Postgres corretto. Dentro `` sql`...${value}...` ``
**non ha contesto del tipo**: il valore va a postgres-js, che per non-primitive
(`Date`, `Buffer` custom, oggetti) cade sul path di encoding testuale
(`.str(x) → Buffer.byteLength(x)`) e crasha con:

```
TypeError: The "string" argument must be of type string or an instance of
Buffer or ArrayBuffer. Received an instance of Date
```

(Regressione `SCONTRINOZERO-TEST-7`, 14 giorni nascosta nel flow "Verifica
connessione" AdE.)

**Pattern obbligato per `Date` in `` sql`` ``:**

```typescript
sql`date_trunc('milliseconds', ${col}) = ${date.toISOString()}::timestamptz`;
```

ISO string + cast esplicito (`::timestamptz`, `::timestamp`, `::date` in base
al tipo). La precisione al millisecondo è preservata.

**Test di regressione obbligato:** rendere il fragment con `PgDialect.sqlToQuery()`
e asserire che nessun `Date` finisca tra i `compiled.params`. I mock di `.where()`
in stile `vi.fn().mockReturnValue({ returning })` non catturano il bug perché
bypassano l'encoding di postgres-js.

**Smoke test post-deploy:** per path DB introdotti ex novo (nuovi bottoni AdE,
recovery flow, batch jobs) cliccare almeno una volta su sandbox subito dopo il
tag. I 2400+ unit test verdi non garantiscono che postgres-js sappia binare i
parametri reali.

---

## Race condition multi-riga: constraint DB > application lock

Per operazioni duplicate concorrenti (es. doppio VOID dello stesso SALE), la
soluzione robusta è un **constraint DB** (UNIQUE, partial index), non un lock
applicativo. Il DB garantisce atomicità; il codice è TOCTOU-vulnerabile.

Pattern:

1. `UNIQUE INDEX ... WHERE col IS NOT NULL` in migrazione
2. Insert con `onConflictDoNothing()`
3. Se `returning` è vuoto, discriminare il caso "stessa key" (idempotency) da
   "key diversa, stessa riga target" (race) via query separata

## Idempotency key: SEMPRE per-tenant

I vincoli UNIQUE su `idempotency_key` vanno scoped al tenant
(`UNIQUE(business_id, idempotency_key)`). Un constraint globale blocca business
diversi che usano accidentalmente la stessa UUID ed espone metadati cross-tenant.
I fallback di lookup devono filtrare per `businessId` in aggiunta alla key.
