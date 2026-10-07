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
 * Con @sentry/nextjs 11 i default allegavano `request.data` (il body), e per
 * una server action il body sono gli argomenti in chiaro.
 */

const captured: ErrorEvent[] = [];
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  Sentry.init({
    dsn: "https://public@o0.ingest.sentry.io/0",
    tracesSampleRate: 0,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend(event) {
      captured.push(event);
      return null;
    },
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
  captured.length = 0;
});

async function postAndCapture(
  body: string | FormData,
  secret: string,
): Promise<ErrorEvent> {
  await fetch(`${baseUrl}/dashboard/settings`, { method: "POST", body });
  await Sentry.flush(2000);

  expect(captured).toHaveLength(1);
  const event = captured[0];
  // Controllo: l'instrumentation HTTP era attiva, altrimenti l'assenza del
  // body non dimostrerebbe niente.
  expect(event.request?.method).toBe("POST");
  expect(event.request?.url).toBe(`${baseUrl}/dashboard/settings`);
  expect(JSON.stringify(event)).not.toContain(secret);
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
});
