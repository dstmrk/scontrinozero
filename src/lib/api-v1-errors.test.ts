import { describe, it, expect } from "vitest";
import {
  REQUEST_ID_HEADER,
  V1_ERROR_CATALOG,
  isRetryableV1Error,
  newRequestId,
  v1Error,
  v1Json,
  v1NoContent,
  type V1ErrorCode,
} from "./api-v1-errors";

const REQUEST_ID = "11111111-2222-3333-4444-555555555555";

describe("newRequestId", () => {
  it("genera un UUID diverso a ogni chiamata", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(a).not.toBe(b);
  });
});

describe("v1Error", () => {
  it("emette l'envelope { code, message, requestId } e nient'altro", async () => {
    const res = v1Error("NOT_FOUND", "Documento non trovato.", REQUEST_ID);
    const body = await res.json();

    expect(body).toEqual({
      code: "NOT_FOUND",
      message: "Documento non trovato.",
      requestId: REQUEST_ID,
    });
    // Il campo legacy `error` è stato rimosso (breaking change v1, REVIEW #18)
    expect(body).not.toHaveProperty("error");
  });

  it("deriva lo status dal catalogo", () => {
    expect(v1Error("UNAUTHORIZED", "x", REQUEST_ID).status).toBe(401);
    expect(v1Error("PLAN_UPGRADE_REQUIRED", "x", REQUEST_ID).status).toBe(402);
    expect(v1Error("BUSINESS_KEY_REQUIRED", "x", REQUEST_ID).status).toBe(403);
    expect(v1Error("PAYLOAD_TOO_LARGE", "x", REQUEST_ID).status).toBe(413);
    expect(v1Error("ADE_REJECTED", "x", REQUEST_ID).status).toBe(422);
    expect(v1Error("DB_TIMEOUT", "x", REQUEST_ID).status).toBe(503);
    expect(v1Error("ADE_UNAVAILABLE", "x", REQUEST_ID).status).toBe(503);
  });

  it("include Retry-After quando il catalogo lo prevede", () => {
    expect(
      v1Error("DB_TIMEOUT", "x", REQUEST_ID).headers.get("Retry-After"),
    ).toBe("5");
    expect(
      v1Error("ADE_UNAVAILABLE", "x", REQUEST_ID).headers.get("Retry-After"),
    ).toBe("10");
    expect(
      v1Error("PENDING_IN_PROGRESS", "x", REQUEST_ID).headers.get(
        "Retry-After",
      ),
    ).toBe("2");
  });

  it("omette Retry-After sugli errori permanenti", () => {
    expect(
      v1Error("ADE_REAUTH_REQUIRED", "x", REQUEST_ID).headers.get(
        "Retry-After",
      ),
    ).toBeNull();
    expect(
      v1Error("IDEMPOTENCY_PAYLOAD_MISMATCH", "x", REQUEST_ID).headers.get(
        "Retry-After",
      ),
    ).toBeNull();
  });

  it("accetta un Retry-After dinamico (rate limit)", () => {
    const res = v1Error("RATE_LIMIT_EXCEEDED", "x", REQUEST_ID, {
      retryAfterSeconds: 1234,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
  });

  it("espone X-Request-Id, CORS e gli header leggibili dal browser", () => {
    const res = v1Error("NOT_FOUND", "x", REQUEST_ID);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    // Senza expose-headers un client browser cross-origin non potrebbe leggere
    // né il requestId né il backoff suggerito.
    const exposed = res.headers.get("Access-Control-Expose-Headers") ?? "";
    expect(exposed).toContain(REQUEST_ID_HEADER);
    expect(exposed).toContain("Retry-After");
  });
});

describe("v1Json", () => {
  it("propaga X-Request-Id e CORS anche sulle risposte di successo", async () => {
    const res = v1Json({ documentId: "abc" }, REQUEST_ID, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(res.json()).resolves.toEqual({ documentId: "abc" });
  });

  it("usa 200 come status di default", () => {
    expect(v1Json({ ok: true }, REQUEST_ID).status).toBe(200);
  });
});

describe("v1NoContent", () => {
  it("emette 204 con CORS, metodi consentiti e X-Request-Id", () => {
    const res = v1NoContent("GET, POST, OPTIONS", REQUEST_ID);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
  });
});

describe("V1_ERROR_CATALOG", () => {
  it("marca retryable esattamente i codici transient", () => {
    const retryable = (Object.keys(V1_ERROR_CATALOG) as V1ErrorCode[]).filter(
      (code) => isRetryableV1Error(code),
    );

    expect(retryable.sort()).toEqual(
      [
        "ADE_UNAVAILABLE",
        "DB_TIMEOUT",
        "PENDING_IN_PROGRESS",
        "RATE_LIMIT_EXCEEDED",
        "VOID_PENDING_IN_PROGRESS",
      ].sort(),
    );
  });

  it("non marca retryable nessun errore 4xx di input o di stato definitivo", () => {
    for (const code of [
      "INVALID_BODY",
      "VALIDATION_ERROR",
      "INVALID_QUERY_PARAM",
      "INVALID_ID",
      "UNAUTHORIZED",
      "PLAN_UPGRADE_REQUIRED",
      "BUSINESS_KEY_REQUIRED",
      "NOT_FOUND",
      "ALREADY_REJECTED",
      "ALREADY_VOIDED",
      "VOID_ALREADY_TARGETED",
      "IDEMPOTENCY_PAYLOAD_MISMATCH",
      "ADE_REAUTH_REQUIRED",
      "ADE_PASSWORD_EXPIRED",
      "PAYLOAD_TOO_LARGE",
      "ADE_REJECTED",
    ] as const) {
      expect(isRetryableV1Error(code)).toBe(false);
    }
  });

  it("dà un Retry-After statico solo ai retryable che non lo calcolano a runtime", () => {
    for (const [code, spec] of Object.entries(V1_ERROR_CATALOG)) {
      if ("retryAfter" in spec) {
        expect(isRetryableV1Error(code as V1ErrorCode)).toBe(true);
      }
    }
    // Il rate limit è retryable ma il backoff dipende dalla finestra scorrevole.
    expect(V1_ERROR_CATALOG.RATE_LIMIT_EXCEEDED).not.toHaveProperty(
      "retryAfter",
    );
  });
});
