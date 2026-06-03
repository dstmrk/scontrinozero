import * as Sentry from "@sentry/nextjs";
import { isBenignFormDataParseError } from "@/lib/sentry-filters";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Log drain: drena i pino logs (info e superiori) verso Sentry Logs, cosi'
  // gli errori non-eccezione e il flusso applicativo sono interrogabili senza
  // entrare nel container via SSH. L'integrazione legge l'output POST-redazione
  // (canale diagnostico pino_asJson): i REDACT_PATHS di src/lib/logger.ts
  // (ip, codiceFiscale, token, cookie, ...) restano censurati anche qui.
  // `error.levels` e' lasciato vuoto (default): gli errori restano catturati
  // come Issue dall'hook in logger.ts, evitando una doppia cattura.
  enableLogs: true,
  integrations: [
    Sentry.pinoIntegration({
      log: { levels: ["info", "warn", "error", "fatal"] },
    }),
  ],
  beforeSend(event, hint) {
    // Rumore da bot che fanno POST a path inesistenti (issue SCONTRINOZERO-E)
    if (isBenignFormDataParseError(event, hint)) {
      return null;
    }
    return event;
  },
});
