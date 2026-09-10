import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStandardWebhook } from "./standard-webhook";

/**
 * Test vector pubblicato nella spec Standard Webhooks. Vale più di dieci test
 * scritti attorno alla nostra implementazione: quelli passerebbero anche se
 * firmassimo una stringa diversa da `${id}.${timestamp}.${body}`, questo no.
 */
const SPEC = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: "1614265330",
  payload: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
} as const;

const SPEC_NOW_MS = Number(SPEC.timestamp) * 1000;

function headersFor(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    "webhook-id": SPEC.id,
    "webhook-timestamp": SPEC.timestamp,
    "webhook-signature": SPEC.signature,
    ...overrides,
  });
}

function sign(secretBase64: string, id: string, ts: string, payload: string) {
  return `v1,${createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${id}.${ts}.${payload}`)
    .digest("base64")}`;
}

describe("verifyStandardWebhook", () => {
  it("accetta il test vector della spec", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: true });
  });

  it("accetta il segreto nel formato Supabase `v1,whsec_...`", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: `v1,${SPEC.secret}`,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: true });
  });

  it("accetta il segreto come base64 nudo, senza prefisso", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: true });
  });

  it("accetta se una sola delle firme in lista combacia (rotazione chiave)", () => {
    const stale = sign(
      "YWx0cm8tc2VncmV0by1jaGUtbm9uLXVzaWFtbw==",
      SPEC.id,
      SPEC.timestamp,
      SPEC.payload,
    );

    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor({
        "webhook-signature": `${stale} ${SPEC.signature}`,
      }),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: true });
  });

  it("rifiuta un body alterato di un solo byte", () => {
    const result = verifyStandardWebhook({
      payload: '{"test": 2432232315}',
      headers: headersFor(),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rifiuta una firma valida per un id diverso (replay su altro messaggio)", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor({ "webhook-id": "msg_un_altro_messaggio" }),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rifiuta una firma senza il prefisso di versione", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor({
        "webhook-signature": SPEC.signature.slice("v1,".length),
      }),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it.each([
    ["webhook-id", "missing_headers"],
    ["webhook-timestamp", "missing_headers"],
    ["webhook-signature", "missing_headers"],
  ])("rifiuta la richiesta senza %s", (header, reason) => {
    const headers = headersFor();
    headers.delete(header);

    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers,
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: false, reason });
  });

  it("rifiuta un timestamp non numerico", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor({ "webhook-timestamp": "ieri" }),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: false, reason: "timestamp_invalid" });
  });

  it("rifiuta un messaggio più vecchio della tolleranza (replay)", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS + 6 * 60 * 1000,
    });

    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
  });

  it("rifiuta un messaggio datato nel futuro oltre la tolleranza", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS - 6 * 60 * 1000,
    });

    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
  });

  it("accetta al limite della tolleranza", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: SPEC.secret,
      nowMs: SPEC_NOW_MS + 5 * 60 * 1000,
    });

    expect(result).toEqual({ ok: true });
  });

  it("distingue un segreto illeggibile da una firma sbagliata", () => {
    const result = verifyStandardWebhook({
      payload: SPEC.payload,
      headers: headersFor(),
      secret: "",
      nowMs: SPEC_NOW_MS,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_secret" });
  });
});
