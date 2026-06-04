import { NextResponse } from "next/server";
import { getTrustedAppUrl, TrustedAppUrlError } from "@/lib/trusted-app-url";
import { getAppRelease } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Smoke health probe per le env d'identità.
 *
 * Ritorna 200 con `{ status: "ok", appUrl, release, hostnames }` quando
 * `getTrustedAppUrl()` passa — appUrl e i 3 hostname (app/marketing/api)
 * sono quelli **effettivamente** osservati dal container in esecuzione,
 * utili per verificare il deploy contro l'env attesa.
 *
 * Ritorna 503 con un messaggio actionable se la guard fallisce: anche
 * se `assertIdentityEnv()` (R24) ha già controllato al boot, una
 * rotazione di secret/mount file può invalidare l'identità tra un
 * request e l'altro — questo endpoint la riprende.
 *
 * Auth: nessuna. Le info esposte (URL pubblico + hostname + versione
 * release) sono già pubblicamente osservabili dal traffico HTTP,
 * niente PII né secret. Stesso modello di `/api/health/live`.
 *
 * Uso atteso (smoke test post-deploy, R25):
 *
 *   curl -fsS https://<host>/api/_health/env | jq .
 *   # confronta `appUrl` e `release` con quanto rilasciato.
 */
export function GET(): Response {
  try {
    const appUrl = getTrustedAppUrl();
    return NextResponse.json({
      status: "ok",
      appUrl,
      release: getAppRelease(),
      hostnames: {
        app: pickHostname("APP_HOSTNAME", "NEXT_PUBLIC_APP_HOSTNAME"),
        marketing: pickHostname(
          "MARKETING_HOSTNAME",
          "NEXT_PUBLIC_MARKETING_HOSTNAME",
        ),
        api: pickHostname("API_HOSTNAME", "NEXT_PUBLIC_API_HOSTNAME"),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof TrustedAppUrlError) {
      return NextResponse.json(
        {
          status: "not_ok",
          error: err.message,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
    // Generic 503 — non leakare lo stack di eventuali errori interni
    // (es. secret store unavailable). Il container resta vivo, il probe
    // segnala "non pronto per servire URL-construction".
    return NextResponse.json(
      {
        status: "not_ok",
        error: "identity env unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

function pickHostname(runtime: string, baked: string): string {
  const runtimeVal = process.env[runtime]?.trim();
  if (runtimeVal) return runtimeVal.toLowerCase();
  const bakedVal = process.env[baked]?.trim();
  if (bakedVal) return bakedVal.toLowerCase();
  return "unset";
}
