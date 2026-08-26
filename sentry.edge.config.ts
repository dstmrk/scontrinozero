import * as Sentry from "@sentry/nextjs";
import {
  isBenignFormDataParseError,
  isForeignHostEvent,
} from "@/lib/sentry-filters";
import { getAppRelease } from "@/lib/version";

Sentry.init({
  // `SENTRY_DSN` senza prefisso pubblico → letta a runtime, non inlineata nel
  // bundle. Stessa motivazione di `sentry.server.config.ts` (REVIEW #97).
  dsn: process.env.SENTRY_DSN,
  // Tagga Issue e Sentry Logs col commit in esecuzione (scontrinozero@<ver>+<sha>).
  release: getAppRelease(),
  tracesSampleRate: 0.1,
  enabled: !!process.env.SENTRY_DSN,
  beforeSend(event, hint) {
    // Istanza self-hosted che riporta nel nostro progetto: qui gira il
    // middleware (`src/proxy.ts`), quindi senza questo filtro i suoi errori di
    // routing arriverebbero comunque (issue SCONTRINOZERO-11)
    if (isForeignHostEvent(event)) {
      return null;
    }
    // Rumore da bot che fanno POST a path inesistenti (issue SCONTRINOZERO-E)
    if (isBenignFormDataParseError(event, hint)) {
      return null;
    }
    return event;
  },
});
