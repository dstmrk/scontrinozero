import * as Sentry from "@sentry/nextjs";
import { isBenignFormDataParseError } from "@/lib/sentry-filters";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event, hint) {
    // Rumore da bot che fanno POST a path inesistenti (issue SCONTRINOZERO-E)
    if (isBenignFormDataParseError(event, hint)) {
      return null;
    }
    return event;
  },
});
