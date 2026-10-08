import * as Sentry from "@sentry/nextjs";

/**
 * Next compila questo file anche per il runtime edge, dove ScontrinoZero non
 * gira (nessuna route edge, e `proxy.ts` in Next 16 è sempre Node). Turbopack
 * segue ogni `import()` raggiungibile da qui, anche dentro funzioni che su
 * edge non partono mai: il boot del server sta quindi in `instrumentation-node`,
 * e questo file non deve nominare altri moduli (issue #1030, verificato da
 * `instrumentation.test.ts`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}

export const onRequestError = Sentry.captureRequestError;
