import * as Sentry from "@sentry/nextjs";

// Tetto dei listener per `http.ServerResponse`. Node ne ammette 10 di default e
// oltre quella soglia stampa `MaxListenersExceededWarning: 11 close listeners
// added to [ServerResponse]` — un falso positivo qui: NESSUNO di quei listener
// è nostro e nessuno sopravvive alla risposta. Censimento misurato sul build
// standalone (Next 16.3 + @sentry/nextjs 10.70, un solo GET):
//   1. `recordRequestSession`            @sentry/core (release health)
//   2. `setContext("response")`          @sentry/core (server-subscription)
//   3. cleanup dello stream zlib         next/dist/server/lib/router-server
//   4. `signalFromNodeResponse`          idem, passata del router
//   5. `signalFromNodeResponse`          next-server, passata di render
//   6. `res.onClose` fetch metrics       next/dist/server/app-render
//   7. `AfterContext` onClose            idem
//   8. abort controller della pipe RSC   next/dist/server/pipe-readable
//   9-11. writer + abort delle risposte in streaming (pagine RSC, CSV, PDF)
// Le route leggere si fermano a 8, quelle in streaming toccano 11: il warning
// dipende da quale route arriva per prima, non da una regressione nostra.
// Alziamo il tetto SOLO per `ServerResponse` (non `EventEmitter.defaultMax-
// Listeners`, che maschererebbe una perdita vera su pool DB, stream pdfkit,
// ...) e lo teniamo abbastanza basso da far scattare comunque il warning se un
// domani qualcuno registrasse davvero listener per-risposta senza rimuoverli.
export const SERVER_RESPONSE_MAX_LISTENERS = 20;

/**
 * `setMaxListeners` sul PROTOTYPE vale come default per tutte le istanze:
 * `EventEmitter.init` copia `_maxListeners` ereditato sulla nuova risposta.
 * Va chiamata al boot, prima che il server accetti richieste — le eventuali
 * risposte già costruite mantengono il tetto vecchio.
 *
 * `node:http` è importato dinamicamente: `instrumentation.ts` viene compilata
 * anche per il runtime edge, dove il modulo non esiste.
 */
export async function raiseServerResponseMaxListeners(): Promise<void> {
  const { ServerResponse } = await import("node:http");
  ServerResponse.prototype.setMaxListeners(SERVER_RESPONSE_MAX_LISTENERS);
}

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

// Retention delle righe COMPLETATE di `stripe_webhook_events` (REVIEW.md #82).
// La tabella è un registro di dedup: senza retention accumula una riga per ogni
// evento Stripe ricevuto, per sempre. Stripe non ritenta un evento oltre ~3
// giorni, quindi una riga più vecchia di 30 giorni (~10× quella finestra) non
// deduplica più nulla e resta solo come peso — nessun rischio di riprocessare
// un evento legittimo eliminandola.
export const STRIPE_WEBHOOK_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

const WEBHOOK_CLAIM_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minuti

let webhookClaimSweepStarted = false;

export function startStripeWebhookClaimSweep() {
  if (webhookClaimSweepStarted) return;
  webhookClaimSweepStarted = true;

  const interval: ReturnType<typeof setInterval> = setInterval(async () => {
    try {
      const { lt, and, isNull, isNotNull } = await import("drizzle-orm");
      const { getDb } = await import("@/db");
      const { stripeWebhookEvents } = await import("@/db/schema");
      const { logger } = await import("@/lib/logger");

      const db = getDb();

      // 1. Claim stuck: righe mai completate e più vecchie della soglia.
      //    Sono una manciata — `.returning()` sugli eventId è economico e
      //    serve al log diagnostico.
      const stuckThreshold = new Date(
        Date.now() - STUCK_WEBHOOK_CLAIM_THRESHOLD_MS,
      );
      const unblocked = await db
        .delete(stripeWebhookEvents)
        .where(
          and(
            isNull(stripeWebhookEvents.completedAt),
            lt(stripeWebhookEvents.processedAt, stuckThreshold),
          ),
        )
        .returning({ eventId: stripeWebhookEvents.eventId });

      if (unblocked.length > 0) {
        logger.warn(
          { eventIds: unblocked.map((row) => row.eventId) },
          "Stripe webhook claim sbloccato da sweep automatico",
        );
      }

      // 2. Retention: righe già completate oltre la finestra.
      //    `isNotNull` è ridondante ai fini del risultato (`NULL < x` non è
      //    mai vero, quindi i claim non completati sono già esclusi) ma resta
      //    esplicito: rende i due rami mutuamente esclusivi a colpo d'occhio e
      //    impedisce che un domani si estenda questa `WHERE` credendo di non
      //    toccare i claim in volo, che sono di competenza del ramo 1.
      //    Nessun `.returning()`: qui le righe possono essere molte e serve
      //    solo il conteggio del driver.
      const retentionThreshold = new Date(
        Date.now() - STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      );
      const purged = await db
        .delete(stripeWebhookEvents)
        .where(
          and(
            isNotNull(stripeWebhookEvents.completedAt),
            lt(stripeWebhookEvents.completedAt, retentionThreshold),
          ),
        );

      // Log solo se ha eliminato qualcosa: a regime la finestra è già pulita e
      // lo sweep gira ogni 10 minuti — un log incondizionato sarebbe rumore.
      if (purged.count > 0) {
        logger.info(
          { deleted: purged.count },
          "Retention stripe_webhook_events: righe completate eliminate",
        );
      }
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err }, "Stripe webhook claim sweep fallito");
    }
  }, WEBHOOK_CLAIM_SWEEP_INTERVAL_MS);

  interval.unref();
}

// Cadenza fissa dello sweep GDPR: una volta al giorno è più che sufficiente per
// una soglia di inattività nell'ordine dei mesi (non serve renderla
// configurabile). Le soglie che contano — enabled/giorni di inattività/preavviso
// — restano in INACTIVE_USER_PRUNE_* (src/lib/services/inactive-user-prune-config.ts).
export const INACTIVE_USER_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

// `setInterval` non esegue MAI il callback subito: col solo interval il primo
// sweep cadrebbe 24h dopo il boot, e un ambiente che riavvia il container più
// spesso di una volta al giorno (il Pi dev ridéploya a ogni push su `main`) non
// lo eseguirebbe mai — starvation (REVIEW.md #41). Un run iniziale ritardato
// chiude il buco. 15 minuti tengono lo sweep fuori dalla finestra di overlap
// dei container durante `docker compose up -d`, dove due istanze coesistono.
export const INACTIVE_USER_PRUNE_INITIAL_DELAY_MS = 15 * 60 * 1000; // 15 min

let inactiveUserPruneStarted = false;

/**
 * Sweep GDPR di cancellazione utenti inattivi >12 mesi (PLAN.md v1.4.2).
 * Stesso pattern di `startSupabaseKeepAlive`/`startStripeWebhookClaimSweep`:
 * timer unref'd con guardia d'idempotenza, cadenza fissa giornaliera, più un
 * run iniziale ritardato (REVIEW.md #41). `register()` avvia lo sweep SOLO se
 * la feature è abilitata (`INACTIVE_USER_PRUNE_ENABLED`) e la config passa il
 * floor di sicurezza. Il carico DB/email è tutto lazy dentro il callback: al
 * boot non si tocca il DB.
 *
 * Nessun jitter sul run iniziale: un doppio run è innocuo (il warn è idempotente
 * sul flag `inactivity_warning_sent_at`, il delete è già guardato da
 * `authDeleted`) e un delay deterministico resta testabile.
 */
export function startInactiveUserPruneSweep() {
  if (inactiveUserPruneStarted) return;
  inactiveUserPruneStarted = true;

  const runSweep = async () => {
    try {
      const { pruneInactiveUsers } =
        await import("@/lib/services/inactive-user-prune");
      await pruneInactiveUsers();
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err }, "Inactive user prune sweep fallito");
    }
  };

  const initialRun: ReturnType<typeof setTimeout> = setTimeout(
    runSweep,
    INACTIVE_USER_PRUNE_INITIAL_DELAY_MS,
  );
  initialRun.unref();

  const interval: ReturnType<typeof setInterval> = setInterval(
    runSweep,
    INACTIVE_USER_PRUNE_INTERVAL_MS,
  );
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

    // Prima di servire richieste: il tetto di 10 listener di Node è sotto il
    // costo per-risposta di Next 16 + Sentry (vedi il censimento sopra).
    await raiseServerResponseMaxListeners();

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
    // Le violazioni della config (soglia sotto il floor di sicurezza, invariante
    // warn ≥ delete, env malformata) sono visibili al boot: una soglia sbagliata
    // su una feature IRREVERSIBILE non deve degradare in silenzio (REVIEW.md #39).
    if (pruneConfig.warnings.length > 0) {
      const { logger } = await import("@/lib/logger");
      logger.warn(
        {
          warnings: pruneConfig.warnings,
          pruneEnabled: pruneConfig.enabled,
        },
        "Config prune utenti inattivi non valida",
      );
    }
    if (pruneConfig.enabled) {
      startInactiveUserPruneSweep();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
