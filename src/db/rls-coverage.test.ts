import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * Gate: ogni tabella dichiarata nello schema Drizzle deve avere RLS abilitata da
 * una MIGRAZIONE, non da altro.
 *
 * Perché un test e non l'advisor Supabase: l'advisor guarda UN database alla
 * volta, e sul progetto che serve sandbox/dev le 7 tabelle di
 * `0001_rls_policies.sql` avevano RLS spenta pur risultando la migrazione
 * applicata (tabelle ricreate dopo, registro rimasto indietro). L'unica
 * sorgente di RLS che vale su TUTTI gli ambienti — prod, sandbox, dev,
 * self-hosted — è la migrazione: l'event trigger `ensure_rls` installato dalla
 * dashboard Supabase copre solo i due progetti cloud, e su un Postgres
 * self-hosted non esiste. Questo test tiene la dichiarazione nel repo.
 *
 * Fallimento tipico: hai aggiunto `src/db/schema/<nuova>.ts` + la migrazione
 * che crea la tabella, ma non hai abilitato RLS. Aggiungi alla migrazione:
 *
 *   ALTER TABLE "<nuova>" ENABLE ROW LEVEL SECURITY;
 *
 * Senza policy la tabella resta deny-all per anon/authenticated (Drizzle usa
 * l'owner `postgres` e bypassa comunque RLS): è lo stato corretto per le
 * tabelle server-only. Le tabelle con dati di un utente vogliono in più la
 * policy `_own` sul modello di `0001_rls_policies.sql`.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const SCHEMA_DIR = path.join(process.cwd(), "src", "db", "schema");

/** Nomi delle tabelle Postgres dichiarate via `pgTable("<name>", ...)`. */
function declaredTableNames(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(SCHEMA_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(path.join(SCHEMA_DIR, file), "utf-8");
    for (const match of source.matchAll(/pgTable\(\s*"([^"]+)"/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

/** SQL concatenato di tutte le migrazioni applicate in ordine. */
function migrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"))
    .join("\n");
}

function enablesRls(sql: string, table: string): boolean {
  const pattern = new RegExp(
    String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?${table}"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY`,
    "i",
  );
  return pattern.test(sql);
}

describe("RLS coverage delle migrazioni", () => {
  const tables = declaredTableNames();
  const sql = migrationsSql();

  it("trova le tabelle dichiarate nello schema Drizzle", () => {
    // Guardia del gate stesso: se il parsing smette di trovare tabelle (rename
    // della cartella, pgTable chiamato con una costante) il test sotto
    // passerebbe a vuoto su una lista vuota.
    expect(tables.length).toBeGreaterThanOrEqual(12);
    expect(tables).toContain("profiles");
  });

  it.each(declaredTableNames())(
    "abilita RLS su %s in una migrazione",
    (table) => {
      expect(enablesRls(sql, table)).toBe(true);
    },
  );

  it("abilita RLS anche sul registro delle migrazioni", () => {
    // Creata da scripts/migrate.ts, non dallo schema Drizzle: senza questa
    // riga resterebbe l'unica tabella di public leggibile da anon.
    expect(enablesRls(sql, "__applied_migrations")).toBe(true);
  });
});

/**
 * Le policy `_own` sono `FOR ALL USING (proprietario)`: Postgres riusa USING
 * come controllo di scrittura, quindi garantiscono la proprietà della RIGA ma
 * non quali COLONNE un proprietario può scrivere. Con i grant di default di
 * Supabase (anon/authenticated hanno INSERT/UPDATE/DELETE su public), chi ha
 * un account e la publishable key potrebbe riscrivere `profiles.plan` o
 * `subscriptions.status` sulla propria riga via PostgREST. L'app non passa mai
 * di lì — Drizzle usa l'owner `postgres` e il client service-role — quindi la
 * scrittura diretta dei ruoli API non serve a nessuno e si toglie a livello di
 * privilegio, dove RLS non arriva.
 */
describe("privilegi di scrittura dei ruoli API", () => {
  const WRITE_PRIVILEGES = String.raw`INSERT\s*,\s*UPDATE\s*,\s*DELETE\s*,\s*TRUNCATE`;

  /** Il file di migrazione che revoca la scrittura su tutte le tabelle di public. */
  function revokingMigration(): { file: string; sql: string } | undefined {
    const pattern = new RegExp(
      String.raw`REVOKE\s+${WRITE_PRIVILEGES}\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM`,
      "i",
    );
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith(".sql"),
    )) {
      const body = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      if (pattern.test(body)) return { file, sql: body };
    }
    return undefined;
  }

  it("una migrazione revoca INSERT/UPDATE/DELETE/TRUNCATE su tutte le tabelle di public", () => {
    expect(revokingMigration()).toBeDefined();
  });

  it("la revoca riguarda sia anon sia authenticated", () => {
    const migration = revokingMigration();
    expect(migration?.sql).toMatch(/['"]anon['"]/);
    expect(migration?.sql).toMatch(/['"]authenticated['"]/);
  });

  it("la revoca è guardata sull'esistenza dei ruoli (Postgres self-hosted)", () => {
    // Su un Postgres senza anon/authenticated una REVOKE secca abortirebbe la
    // migrazione, e con lei il boot (`node migrate.js && node server.js`).
    expect(revokingMigration()?.sql).toMatch(/pg_roles/i);
  });

  it("imposta anche i default privileges, per le tabelle create dopo", () => {
    const defaults = new RegExp(
      String.raw`ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+${WRITE_PRIVILEGES}\s+ON\s+TABLES\s+FROM`,
      "i",
    );
    expect(revokingMigration()?.sql).toMatch(defaults);
  });

  it("non toglie SELECT: la lettura resta governata dalle policy", () => {
    const revokes = [
      ...(revokingMigration()?.sql.matchAll(/REVOKE\s+[^;]*?\s+FROM/gi) ?? []),
    ].map((m) => m[0]);
    expect(revokes.length).toBeGreaterThan(0);
    for (const statement of revokes) {
      expect(statement).not.toMatch(/\bSELECT\b/i);
    }
  });
});
