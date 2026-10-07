// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTRY_DATA_COLLECTION } from "@/lib/sentry-filters";

/**
 * SDK vero, niente mock: il rischio che il test copre è proprio un
 * aggiornamento di `@sentry/nextjs` che cambia cosa finisce nell'evento.
 * Con @sentry/nextjs 11 i default allegavano il body della richiesta (per una
 * server action, gli argomenti in chiaro) e l'IP del client.
 *
 * Si guarda l'envelope serializzato che il transport spedirebbe, non
 * l'evento in `beforeSend`: lì ci sono anche metadati interni
 * (`sdkProcessingMetadata`) che l'SDK toglie prima dell'invio.
 */

const CLIENT_IP = "203.0.113.7";

/**
 * Gli header da cui @sentry/core 11 ricava l'IP del client
 * (`ipHeaderNames` in `vendor/getIpAddress`). Dietro Cloudflare Tunnel
 * arrivano `cf-connecting-ip` e `x-forwarded-for`.
 */
const IP_HEADERS: Record<string, string> = {
  "x-client-ip": CLIENT_IP,
  "x-forwarded-for": `${CLIENT_IP}, 198.51.100.1`,
  "fly-client-ip": CLIENT_IP,
  "cf-connecting-ip": CLIENT_IP,
  "fastly-client-ip": CLIENT_IP,
  "true-client-ip": CLIENT_IP,
  "x-real-ip": CLIENT_IP,
  "x-cluster-client-ip": CLIENT_IP,
  "x-forwarded": `for=${CLIENT_IP}`,
  "forwarded-for": CLIENT_IP,
  forwarded: `for=${CLIENT_IP};proto=https`,
  "x-vercel-forwarded-for": CLIENT_IP,
};

const USER_ID = "8d0f6c2a-1b3e-4f5a-9c7d-2e4b6a8c0d1f";

const sentEnvelopes: string[] = [];
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  Sentry.init({
    dsn: "https://public@o0.ingest.sentry.io/0",
    tracesSampleRate: 0,
    dataCollection: SENTRY_DATA_COLLECTION,
    transport: (options: Parameters<typeof Sentry.createTransport>[0]) =>
      Sentry.createTransport(options, async ({ body }) => {
        sentEnvelopes.push(
          typeof body === "string" ? body : new TextDecoder().decode(body),
        );
        return { statusCode: 200 };
      }),
  });

  // Il body si legge come lo legge Next per una server action
  // (`next/dist/server/app-render/action-handler.js`): `pipeline` dalla
  // IncomingMessage, che passa per `on("data")`, il punto in cui l'SDK lo
  // intercetta.
  server = http.createServer(async (req, res) => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    await Promise.all([
      pipeline(req, sink),
      (async () => {
        for await (const chunk of sink) chunks.push(Buffer.from(chunk));
      })(),
    ]);
    // Come `getAuthenticatedUser` (regola 22): l'utente si lega a mano.
    Sentry.setUser({ id: USER_ID });
    Sentry.captureException(new Error("errore dentro una server action"));
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Sentry.close(0);
});

beforeEach(() => {
  sentEnvelopes.length = 0;
});

/**
 * Gli eventi d'errore fra gli envelope spediti: una riga JSON per header e
 * item. Accanto all'evento parte anche un `client_report` (span scartati dal
 * campionamento), che non porta dati della richiesta.
 */
function errorEventsIn(envelopes: string[]): ErrorEvent[] {
  return envelopes
    .flatMap((envelope) => envelope.split("\n"))
    .map((line) => JSON.parse(line))
    .filter((item) => item?.exception);
}

async function postAndCapture(
  body: string | FormData,
  secret: string,
  headers: Record<string, string> = {},
): Promise<ErrorEvent> {
  await fetch(`${baseUrl}/dashboard/settings`, {
    method: "POST",
    body,
    headers,
  });
  await Sentry.flush(2000);

  const events = errorEventsIn(sentEnvelopes);
  expect(events).toHaveLength(1);
  const event = events[0];
  // Controllo: l'instrumentation HTTP era attiva, altrimenti l'assenza dei
  // dati non dimostrerebbe niente.
  expect(event.request?.method).toBe("POST");
  expect(event.request?.url).toBe(`${baseUrl}/dashboard/settings`);
  expect(sentEnvelopes.join("\n")).not.toContain(secret);
  return event;
}

describe("SENTRY_DATA_COLLECTION con l'SDK vero", () => {
  it("argomenti serializzati (connectAdeWithSpid): niente body nell'evento", async () => {
    const event = await postAndCapture(
      JSON.stringify([
        "3f2b7c1e-5a4d-4e8f-9b6a-2c1d0e9f8a7b",
        "JSESSIONID=valore-di-sessione; LtpaToken2=token-sso",
      ]),
      "LtpaToken2",
    );

    expect(event.request?.data).toBeUndefined();
  });

  it("FormData multipart (saveAdeCredentials): niente body nell'evento", async () => {
    const form = new FormData();
    form.set("password", "password-fisconline-di-prova");
    form.set("pin", "1234567890");

    const event = await postAndCapture(form, "password-fisconline-di-prova");

    expect(event.request?.data).toBeUndefined();
  });

  it("l'IP del client non esce né in user.ip_address né negli header", async () => {
    const event = await postAndCapture("[]", CLIENT_IP, IP_HEADERS);

    expect(event.user?.ip_address).toBeUndefined();
    for (const name of Object.keys(IP_HEADERS)) {
      expect(event.request?.headers).not.toHaveProperty(name);
    }
  });

  it("l'utente legato con setUser resta nell'evento (regola 22)", async () => {
    const event = await postAndCapture("[]", CLIENT_IP, IP_HEADERS);

    expect(event.user?.id).toBe(USER_ID);
  });

  it("gli header senza IP restano, utili al triage", async () => {
    const event = await postAndCapture("[]", CLIENT_IP, {
      ...IP_HEADERS,
      "next-action": "7f3a9c",
      "user-agent": "ScontrinoZero-test",
    });

    expect(event.request?.headers?.["next-action"]).toBe("7f3a9c");
    expect(event.request?.headers?.["user-agent"]).toBe("ScontrinoZero-test");
  });
});
