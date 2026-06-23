import * as Sentry from "@sentry/nextjs";

// Supabase free tier pausa i progetti dopo 7 giorni senza query al DB.
// Questo interval esegue una query lightweight ogni 5 giorni per prevenire la pausa.
// Da rimuovere quando si passa a Supabase Pro.
export const KEEP_ALIVE_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 giorni

// Guardia di idempotenza: register() può essere invocata più volte per lo stesso
// deploy (osservati due ping reali a ~13s di distanza in prod, REVIEW.md #29).
// Senza questa guardia ogni invocazione impilerebbe un nuovo setInterval.
let keepAliveStarted = false;

export function startSupabaseKeepAlive() {
  if (keepAliveStarted) return;
  keepAliveStarted = true;

  const interval: ReturnType<typeof setInterval> = setInterval(async () => {
    try {
      const { createAdminSupabaseClient } =
        await import("@/lib/supabase/admin");
      const supabase = createAdminSupabaseClient();
      await supabase.from("profiles").select("id").limit(1);
      const { logger } = await import("@/lib/logger");
      logger.info("Supabase keep-alive ping eseguito");
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err }, "Supabase keep-alive ping fallito");
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  // .unref() evita che l'interval blocchi lo shutdown del processo Node.js
  interval.unref();
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail-fast sulle env d'identita' (NEXT_PUBLIC_APP_URL, *_HOSTNAME, …).
    // In produzione un valore malformato fa throware QUI invece di
    // produrre 503 al primo route che costruisce URL — vedi
    // SCONTRINOZERO-F (NEXT_PUBLIC_APP_URL malformed, 5 eventi su utente
    // FR/Stripe checkout). In dev/test logga warn ma non blocca il loop.
    // Regola 24 di CLAUDE.md, estende la regola 18.
    const { assertIdentityEnv } = await import("@/lib/identity-env");
    assertIdentityEnv();

    await import("../sentry.server.config");

    // Nessun lavoro DB al boot. Le migrazioni NON girano qui: il sistema
    // canonico è il runner handwritten `scripts/migrate.ts` (compilato in
    // `migrate.js`), eseguito come processo separato dal CMD del Dockerfile
    // PRIMA di `server.js` (traccia in `__applied_migrations` con checksum +
    // bootstrap su DB pre-esistente, regola 11 + skill db-migrations).
    // ⚠️ NON aggiungere qui il migrator NATIVO di drizzle: tracciava in una
    // tabella DIVERSA (`drizzle.__drizzle_migrations`), senza bootstrap, e su un
    // DB già inizializzato ritentava da `0000_initial.sql` crashando con
    // `type "document_kind" already exists` (rimosso in PR #582/#645). C'era
    // anche un backfill una-tantum di `trial_vat_ledger` che apriva una
    // connessione a ogni boot: rimosso una volta seedato il ledger in tutti gli
    // ambienti (gli onboarding futuri lo popolano in `verifyAdeCredentials`).

    // Keep-alive Supabase: la guardia di idempotenza dentro
    // startSupabaseKeepAlive() evita timer duplicati su invocazioni multiple
    // di register() (REVIEW.md #29).
    startSupabaseKeepAlive();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
