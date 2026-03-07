import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

// Supabase free tier pausa i progetti dopo 7 giorni senza query al DB.
// Questo interval esegue una query lightweight ogni 5 giorni per prevenire la pausa.
// TODO: rimuovere quando si passa a Supabase Pro.
const KEEP_ALIVE_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 giorni

function startSupabaseKeepAlive() {
  const interval: ReturnType<typeof setInterval> = setInterval(async () => {
    try {
      const { createAdminSupabaseClient } = await import(
        "@/lib/supabase/admin"
      );
      const supabase = createAdminSupabaseClient();
      await supabase.from("profiles").select("id").limit(1);
      logger.info("Supabase keep-alive ping eseguito");
    } catch (err) {
      logger.warn({ err }, "Supabase keep-alive ping fallito");
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  // .unref() evita che l'interval blocchi lo shutdown del processo Node.js
  interval.unref();
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    startSupabaseKeepAlive();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
