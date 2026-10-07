import * as Sentry from "@sentry/nextjs";
import { clientBeforeSend, SENTRY_DATA_COLLECTION } from "@/lib/sentry-filters";

// UNICO entry point Sentry lato browser. Il legacy `sentry.client.config.ts`
// è stato rimosso: il SDK lo inietta solo dal path webpack
// (`@sentry/nextjs/build/cjs/config/webpack.js`) e la build gira su Turbopack
// (default di Next 16), quindi quel file non finiva nel bundle — `beforeSend`
// e Session Replay erano configurati ma morti in produzione
// (issue SCONTRINOZERO-V). Qualsiasi opzione client va aggiunta QUI.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Replay cattura solo sessioni con errori per restare nel free tier
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  integrations: [Sentry.replayIntegration()],
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Stessa impostazione del server: nessun body HTTP negli eventi.
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeSend: clientBeforeSend,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
