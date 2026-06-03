import { describe, expect, it } from "vitest";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { isBenignFormDataParseError } from "./sentry-filters";

function makeEvent(
  transaction: string | undefined,
  exceptionValue?: string,
): ErrorEvent {
  return {
    type: undefined,
    transaction,
    exception: exceptionValue
      ? { values: [{ type: "TypeError", value: exceptionValue }] }
      : undefined,
  } as ErrorEvent;
}

describe("isBenignFormDataParseError", () => {
  it("scarta il TypeError FormData sulla route not-found (sonda bot)", () => {
    const event = makeEvent("POST /_not-found/page");
    const hint: EventHint = {
      originalException: new TypeError("Failed to parse body as FormData."),
    };

    expect(isBenignFormDataParseError(event, hint)).toBe(true);
  });

  it("legge il messaggio dall'exception dell'evento se manca originalException", () => {
    const event = makeEvent(
      "POST /_not-found/page",
      "Failed to parse body as FormData.",
    );

    expect(isBenignFormDataParseError(event)).toBe(true);
  });

  it("non scarta lo stesso errore su una transaction reale (possibile bug)", () => {
    const event = makeEvent("POST /api/v1/receipts");
    const hint: EventHint = {
      originalException: new TypeError("Failed to parse body as FormData."),
    };

    expect(isBenignFormDataParseError(event, hint)).toBe(false);
  });

  it("non scarta altri errori sulla route not-found", () => {
    const event = makeEvent("POST /_not-found/page");
    const hint: EventHint = {
      originalException: new Error("Database connection refused"),
    };

    expect(isBenignFormDataParseError(event, hint)).toBe(false);
  });

  it("gestisce transaction mancante senza lanciare", () => {
    const event = makeEvent(undefined);
    const hint: EventHint = {
      originalException: new TypeError("Failed to parse body as FormData."),
    };

    expect(isBenignFormDataParseError(event, hint)).toBe(false);
  });

  it("gestisce originalException stringa", () => {
    const event = makeEvent("POST /_not-found/page");
    const hint: EventHint = {
      originalException: "Failed to parse body as FormData.",
    };

    expect(isBenignFormDataParseError(event, hint)).toBe(true);
  });

  it("non scarta eventi senza messaggio di errore", () => {
    const event = makeEvent("POST /_not-found/page");

    expect(isBenignFormDataParseError(event)).toBe(false);
  });
});
