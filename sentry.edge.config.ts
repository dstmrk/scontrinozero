import * as Sentry from "@sentry/nextjs";
import { isBenignFormDataParseError } from "@/lib/sentry-filters";
import { getAppRelease } from "@/lib/version";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Tagga Issue e Sentry Logs col commit in esecuzione (scontrinozero@<ver>+<sha>).
  release: getAppRelease(),
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
