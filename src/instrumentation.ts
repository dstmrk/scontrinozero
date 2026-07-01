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

// Soglia oltre la quale un claim non completato è considerato "stuck"
// (REVIEW.md #20: handleEvent fallito + DELETE del claim anch'essa fallita).
export const STUCK_WEBHOOK_CLAIM_THRESHOLD_MS = 30 * 60 * 1000; // 30 minuti
const WEBHOOK_CLAIM_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minuti

let webhookClaimSweepStarted = false;

export function startStripeWebhookClaimSweep() {
  if (webhookClaimSweepStarted) return;
  webhookClaimSweepStarted = true;

  const interval: ReturnType<typeof setInterval> = setInterval(async () => {
    try {
      const { lt, and, isNull } = await import("drizzle-orm");
      const { getDb } = await import("@/db");
      const { stripeWebhookEvents } = await import("@/db/schema");
      const { logger } = await import("@/lib/logger");

      const db = getDb();
      const threshold = new Date(Date.now() - STUCK_WEBHOOK_CLAIM_THRESHOLD_MS);
      const unblocked = await db
        .delete(stripeWebhookEvents)
        .where(
          and(
            isNull(stripeWebhookEvents.completedAt),
            lt(stripeWebhookEvents.processedAt, threshold),
          ),
        )
        .returning({ eventId: stripeWebhookEvents.eventId });

      if (unblocked.length > 0) {
        logger.warn(
          { eventIds: unblocked.map((row) => row.eventId) },
          "Stripe webhook claim sbloccato da sweep automatico",
        );
      }
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err }, "Stripe webhook claim sweep fallito");
    }
  }, WEBHOOK_CLAIM_SWEEP_INTERVAL_MS);

  interval.unref();
}

let inactiveUserPruneStarted = false;

/**
 * Sweep GDPR di cancellazione utenti inattivi >12 mesi (PLAN.md v1.4.2).
 * Stesso pattern di `startSupabaseKeepAlive`/`startStripeWebhookClaimSweep`:
 * `setInterval` unref'd con guardia d'idempotenza. L'intervallo arriva dalla
 * config env (`INACTIVE_USER_PRUNE_INTERVAL_MS`, default 24h): `register()`
 * avvia lo sweep SOLO se la feature è abilitata (`INACTIVE_USER_PRUNE_ENABLED`),
 * quindi qui l'`intervalMs` è già risolto. Il carico DB/email è tutto lazy
 * dentro il callback: al boot non si tocca il DB.
 */
export function startInactiveUserPruneSweep(intervalMs: number) {
  if (inactiveUserPruneStarted) return;
  inactiveUserPruneStarted = true;

  const interval: ReturnType<typeof setInterval> = setInterval(async () => {
    try {
      const { pruneInactiveUsers } =
        await import("@/lib/services/inactive-user-prune");
      await pruneInactiveUsers();
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err }, "Inactive user prune sweep fallito");
    }
  }, intervalMs);

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

    // Sweep dei claim webhook Stripe "stuck" (REVIEW.md #20): stessa guardia
    // di idempotenza e pattern setInterval unref'd di startSupabaseKeepAlive.
    startStripeWebhookClaimSweep();

    // Sweep GDPR cancellazione utenti inattivi >12 mesi (PLAN.md v1.4.2).
    // Feature OPT-IN e distruttiva: parte SOLO se INACTIVE_USER_PRUNE_ENABLED=true.
    // La config (pure, no deps DB) è letta a parte per non tirare dentro la
    // pipeline di cancellazione quando la feature è spenta (default).
    const { readPruneConfig } =
      await import("@/lib/services/inactive-user-prune-config");
    const pruneConfig = readPruneConfig();
    if (pruneConfig.enabled) {
      startInactiveUserPruneSweep(pruneConfig.intervalMs);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
