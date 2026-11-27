import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPABASE_AUTH_ERROR_CLASSES } from "./supabase-auth-error";

/**
 * Guardia sul vocabolario `errorClass` contro lo scrubbing lato server di
 * Sentry.
 *
 * Con i default scrubber attivi, Sentry sostituisce con `[Filtered]` ogni
 * valore che *contiene* una di queste stringhe, non solo le chiavi che le
 * portano (docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing).
 * `invalid_credentials` arrivava così su Sentry Logs come `[Filtered]` su
 * tutti i `signIn failed`: la classificazione nata per separare "password
 * sbagliata" da "Supabase giù" spariva proprio nel caso più frequente.
 *
 * Il vocabolario si adegua allo scrubber, non il contrario: lo scrubbing di
 * default resta la rete di sicurezza contro i segreti loggati per errore.
 */
const SENTRY_DEFAULT_SCRUBBED = [
  "password",
  "secret",
  "passwd",
  "api_key",
  "apikey",
  "auth",
  "credentials",
  "mysql_pwd",
  "privatekey",
  "private_key",
  "token",
  "bearer",
] as const;

const SRC_DIR = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [full];
  });
}

/** Ogni letterale scritto come `errorClass: "..."` nel codice di produzione. */
function literalErrorClasses(): { value: string; file: string }[] {
  const pattern = /errorClass:\s*["'`]([^"'`]+)["'`]/g;
  return sourceFiles(SRC_DIR).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(pattern)].map((m) => ({
      value: m[1],
      file: path.relative(SRC_DIR, file),
    })),
  );
}

function scrubbedSubstring(value: string): string | undefined {
  const lower = value.toLowerCase();
  return SENTRY_DEFAULT_SCRUBBED.find((s) => lower.includes(s));
}

describe("vocabolario errorClass vs scrubbing Sentry", () => {
  it("trova i letterali errorClass nel sorgente (lo scanner non è cieco)", () => {
    expect(literalErrorClasses().map((l) => l.value)).toContain(
      "ade_user_error",
    );
  });

  it("nessun letterale errorClass contiene una stringa scrubbata", () => {
    const offending = literalErrorClasses()
      .map((l) => ({ ...l, match: scrubbedSubstring(l.value) }))
      .filter((l) => l.match !== undefined)
      .map((l) => `${l.file}: "${l.value}" contiene "${l.match}"`);
    expect(offending).toEqual([]);
  });

  it("nessuna classe d'errore Supabase Auth contiene una stringa scrubbata", () => {
    const offending = SUPABASE_AUTH_ERROR_CLASSES.filter(
      (c) => scrubbedSubstring(c) !== undefined,
    );
    expect(offending).toEqual([]);
  });
});
