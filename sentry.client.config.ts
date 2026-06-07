import * as Sentry from "@sentry/nextjs";
import { isClientNetworkFailure } from "@/lib/sentry-filters";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Replay cattura solo sessioni con errori per restare nel free tier
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  integrations: [Sentry.replayIntegration()],
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event, hint) {
    // Rumore di rete transiente su mobile (issue SCONTRINOZERO-J)
    if (isClientNetworkFailure(event, hint)) {
      return null;
    }
    return event;
  },
});
