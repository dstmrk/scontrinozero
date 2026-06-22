import * as Sentry from "@sentry/nextjs";

// Supabase free tier pausa i progetti dopo 7 giorni senza query al DB.
// Questo interval esegue una query lightweight ogni 5 giorni per prevenire la pausa.
// TODO: rimuovere quando si passa a Supabase Pro.
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

    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");

    const rawUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error(
        "DATABASE_URL_DIRECT or DATABASE_URL is required to run migrations",
      );
    }

    // postgres.js v3 tries ALL resolved addresses (IPv4 + IPv6) in order.
    // On VPSes without IPv6 routing, AAAA records cause ENETUNREACH before
    // the IPv4 attempt. We resolve to IPv4 explicitly to skip that.
    const { resolve4 } = await import("node:dns/promises");
    const parsed = new URL(rawUrl);
    const [ipv4] = await resolve4(parsed.hostname);
    parsed.hostname = ipv4;
    const url = parsed.toString();

    // max: 1 — dedicated connection just for migrations
    // prepare: false — required for Supabase transaction pooler (harmless for direct)
    const client = postgres(url, { max: 1, prepare: false });
    const db = drizzle({ client });

    await migrate(db, { migrationsFolder: "./supabase/migrations" });

    // Backfill una-tantum del registro anti-frode `trial_vat_ledger` dalle
    // P.IVA già su `profiles` (account creati prima del ledger). Self-gated:
    // no-op se il ledger non è vuoto, quindi gira a ogni boot senza effetti.
    // Degradare, non crashare (regola 19): un errore qui non deve impedire
    // l'avvio — gli onboarding futuri popolano comunque il ledger.
    try {
      const { backfillTrialVatLedgerIfEmpty } =
        await import("@/lib/backfill-trial-vat-ledger");
      await backfillTrialVatLedgerIfEmpty(db);
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.error(
        { err, critical: true },
        "backfill trial_vat_ledger fallito al boot (ignorato, riprova al prossimo avvio)",
      );
    }

    await client.end();

    // Keep-alive Supabase in coda al boot nodejs (dopo migrazioni e backfill):
    // la guardia di idempotenza dentro startSupabaseKeepAlive() evita timer
    // duplicati su invocazioni multiple di register().
    startSupabaseKeepAlive();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
