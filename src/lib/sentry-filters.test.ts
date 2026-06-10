import { describe, expect, it } from "vitest";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import {
  isBenignFormDataParseError,
  isClientNetworkFailure,
  isReactStreamingDomError,
} from "./sentry-filters";

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

function makeStreamEvent(
  exceptionValue: string,
  functions: (string | undefined)[],
): ErrorEvent {
  return {
    type: undefined,
    transaction: "/dashboard",
    exception: {
      values: [
        {
          type: "TypeError",
          value: exceptionValue,
          stacktrace: { frames: functions.map((fn) => ({ function: fn })) },
        },
      ],
    },
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

describe("isClientNetworkFailure", () => {
  it('filtra "Load failed" da originalException Error (iOS/Safari)', () => {
    const event = makeEvent("/login");
    const hint: EventHint = {
      originalException: new TypeError("Load failed"),
    };

    expect(isClientNetworkFailure(event, hint)).toBe(true);
  });

  it('filtra "Failed to fetch" da originalException Error (Chrome/Firefox)', () => {
    const event = makeEvent("/login");
    const hint: EventHint = {
      originalException: new TypeError("Failed to fetch"),
    };

    expect(isClientNetworkFailure(event, hint)).toBe(true);
  });

  it("filtra quando il messaggio è in originalException stringa", () => {
    const event = makeEvent("/login");
    const hint: EventHint = { originalException: "Load failed" };

    expect(isClientNetworkFailure(event, hint)).toBe(true);
  });

  it("filtra quando il messaggio è nell'exception dell'evento (senza hint)", () => {
    const event = makeEvent("/login", "Load failed");

    expect(isClientNetworkFailure(event)).toBe(true);
  });

  it('non filtra "Network request failed" (messaggio non standard)', () => {
    const event = makeEvent("/login");
    const hint: EventHint = {
      originalException: new TypeError("Network request failed"),
    };

    expect(isClientNetworkFailure(event, hint)).toBe(false);
  });

  it("non filtra errori applicativi diversi dai fallimenti di rete", () => {
    const event = makeEvent("/login");
    const hint: EventHint = {
      originalException: new TypeError("Failed to parse body as FormData"),
    };

    expect(isClientNetworkFailure(event, hint)).toBe(false);
  });

  it("non filtra eventi senza messaggio di errore", () => {
    const event = makeEvent("/login");

    expect(isClientNetworkFailure(event)).toBe(false);
  });
});

describe("isReactStreamingDomError", () => {
  it("filtra la frase Safari `null is not an object` lanciata da $RS", () => {
    const event = makeStreamEvent(
      "null is not an object (evaluating 'b.parentNode')",
      ["global code", "$RS"],
    );

    expect(isReactStreamingDomError(event)).toBe(true);
  });

  it("filtra la frase Chrome `Cannot read properties of null` lanciata da $RC", () => {
    const event = makeStreamEvent(
      "Cannot read properties of null (reading 'parentNode')",
      ["$RC"],
    );

    expect(isReactStreamingDomError(event)).toBe(true);
  });

  it("legge il messaggio da originalException quando presente", () => {
    const event = makeStreamEvent("ignorato", ["$RS"]);
    const hint: EventHint = {
      originalException: new TypeError(
        "null is not an object (evaluating 'b.parentNode')",
      ),
    };

    expect(isReactStreamingDomError(event, hint)).toBe(true);
  });

  it("non filtra un bug applicativo reale su parentNode senza frame Fizz", () => {
    const event = makeStreamEvent(
      "null is not an object (evaluating 'el.parentNode')",
      ["global code", "MyComponent", "handleClick"],
    );

    expect(isReactStreamingDomError(event)).toBe(false);
  });

  it("non filtra un errore del runtime Fizz con messaggio non correlato", () => {
    const event = makeStreamEvent("something else broke", ["$RS"]);

    expect(isReactStreamingDomError(event)).toBe(false);
  });

  it("richiede sia `parentNode` sia `null` nel messaggio", () => {
    const event = makeStreamEvent(
      "Cannot read properties of undefined (reading 'parentNode')",
      ["$RS"],
    );

    expect(isReactStreamingDomError(event)).toBe(false);
  });

  it("gestisce eventi senza exception/frames senza lanciare", () => {
    const event = makeEvent(
      "/dashboard",
      "null is not an object (evaluating 'b.parentNode')",
    );

    expect(isReactStreamingDomError(event)).toBe(false);
  });

  it("gestisce frame con function undefined", () => {
    const event = makeStreamEvent(
      "null is not an object (evaluating 'b.parentNode')",
      [undefined, undefined],
    );

    expect(isReactStreamingDomError(event)).toBe(false);
  });
});
