// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeForTelemetry } from "@/lib/logger";

describe("sanitizeForTelemetry", () => {
  it("returns empty object for non-object input", () => {
    expect(sanitizeForTelemetry(null)).toEqual({});
    expect(sanitizeForTelemetry(undefined)).toEqual({});
    expect(sanitizeForTelemetry("string")).toEqual({});
    expect(sanitizeForTelemetry(42)).toEqual({});
  });

  it("passes through safe context keys", () => {
    const input = {
      requestId: "req-1",
      path: "/api/test",
      method: "POST",
      userId: "user-123",
      eventType: "receipt.created",
      statusCode: 200,
      documentId: "doc-uuid",
      businessId: "biz-uuid",
      action: "signUp",
      ipHash: "h-abc",
    };
    const result = sanitizeForTelemetry(input);
    expect(result).toEqual(input);
  });

  it("strips raw 'ip' from telemetry (GDPR — P1 REVIEW.md)", () => {
    const result = sanitizeForTelemetry({
      userId: "u1",
      ip: "1.2.3.4",
      ipHash: "h-abc",
    });
    expect(result).not.toHaveProperty("ip");
    expect(result).toHaveProperty("ipHash", "h-abc");
    expect(result).toHaveProperty("userId", "u1");
  });

  it("strips sensitive fields: password", () => {
    const result = sanitizeForTelemetry({ userId: "u1", password: "secret" });
    expect(result).not.toHaveProperty("password");
    expect(result).toHaveProperty("userId", "u1");
  });

  it("strips sensitive fields: token", () => {
    const result = sanitizeForTelemetry({ requestId: "r1", token: "abc123" });
    expect(result).not.toHaveProperty("token");
    expect(result).toHaveProperty("requestId", "r1");
  });

  it("strips sensitive fields: actionLink", () => {
    const result = sanitizeForTelemetry({
      userId: "u1",
      actionLink: "https://example.com/reset?token=secret",
    });
    expect(result).not.toHaveProperty("actionLink");
  });

  it("strips sensitive fields: codiceFiscale", () => {
    const result = sanitizeForTelemetry({
      userId: "u1",
      codiceFiscale: "RSSMRA80A01H501U",
    });
    expect(result).not.toHaveProperty("codiceFiscale");
  });

  it("strips sensitive fields: cookie", () => {
    const result = sanitizeForTelemetry({
      path: "/login",
      cookie: "session=abc; token=xyz",
    });
    expect(result).not.toHaveProperty("cookie");
    expect(result).toHaveProperty("path");
  });

  it("strips sensitive fields: authorization", () => {
    const result = sanitizeForTelemetry({
      path: "/api",
      authorization: "Bearer secret-token",
    });
    expect(result).not.toHaveProperty("authorization");
  });

  it("strips sensitive fields: encryptedPassword, encryptedPin, apiKeyRaw, keyHash", () => {
    const result = sanitizeForTelemetry({
      encryptedPassword: "enc-pass",
      encryptedPin: "enc-pin",
      apiKeyRaw: "raw-key",
      keyHash: "hash-value",
      resetLink: "https://reset.link",
    });
    expect(result).not.toHaveProperty("encryptedPassword");
    expect(result).not.toHaveProperty("encryptedPin");
    expect(result).not.toHaveProperty("apiKeyRaw");
    expect(result).not.toHaveProperty("keyHash");
    expect(result).not.toHaveProperty("resetLink");
  });

  it("strips unknown / arbitrary keys", () => {
    const result = sanitizeForTelemetry({
      userId: "u1",
      someProprietary: "internal-data",
      anotherField: { nested: "value" },
    });
    expect(result).not.toHaveProperty("someProprietary");
    expect(result).not.toHaveProperty("anotherField");
    expect(result).toHaveProperty("userId", "u1");
  });

  it("includes err as {name, message} only — strips stack and other properties", () => {
    const error = new Error("something went wrong");
    error.stack = "Error: something went wrong\n  at ...";
    const result = sanitizeForTelemetry({ userId: "u1", err: error });
    expect(result["err"]).toEqual({
      name: "Error",
      message: "something went wrong",
    });
    expect((result["err"] as Record<string, unknown>)["stack"]).toBeUndefined();
  });

  it("ignores err if it is not an Error instance", () => {
    const result = sanitizeForTelemetry({ err: { message: "raw obj" } });
    expect(result).not.toHaveProperty("err");
  });

  it("returns only safe keys from a mixed real-world log context", () => {
    const result = sanitizeForTelemetry({
      userId: "u1",
      businessId: "b1",
      password: "should-not-appear",
      token: "should-not-appear",
      codiceFiscale: "RSSMRA80A01H501U",
      adeErrorCodes: ["GEN001"],
      err: new Error("AdE rejected"),
    });

    expect(result).toHaveProperty("userId", "u1");
    expect(result).toHaveProperty("businessId", "b1");
    expect(result).toHaveProperty("adeErrorCodes");
    expect(result["err"]).toMatchObject({
      name: "Error",
      message: "AdE rejected",
    });

    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("codiceFiscale");
  });
});
