import { describe, expect, it } from "vitest";
import { readJsonWithLimit } from "./request-utils";

function makeRequest(body: string): Request {
  return new Request("https://example.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("readJsonWithLimit", () => {
  it("returns ok with parsed data when payload is within limit", async () => {
    const body = JSON.stringify({ foo: "bar" });
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, 1024);
    expect(result).toEqual({ ok: true, data: { foo: "bar" } });
  });

  it("returns tooLarge when payload exceeds limit", async () => {
    const body = "x".repeat(100);
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, 10);
    expect(result).toEqual({ ok: false, tooLarge: true });
  });

  it("returns parseError for invalid JSON within limit", async () => {
    const body = "not-json{{{";
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, 1024);
    expect(result).toEqual({ ok: false, parseError: true });
  });

  it("accepts a payload exactly at the limit", async () => {
    const body = JSON.stringify({ n: 1 });
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, body.length);
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects a payload one byte over the limit", async () => {
    const body = JSON.stringify({ n: 1 });
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, body.length - 1);
    expect(result).toMatchObject({ ok: false, tooLarge: true });
  });

  it("handles an empty body (valid empty JSON object)", async () => {
    const body = "{}";
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, 1024);
    expect(result).toEqual({ ok: true, data: {} });
  });

  it("handles a JSON array body", async () => {
    const body = JSON.stringify([1, 2, 3]);
    const req = makeRequest(body);
    const result = await readJsonWithLimit(req, 1024);
    expect(result).toEqual({ ok: true, data: [1, 2, 3] });
  });

  describe("Content-Length pre-check", () => {
    it("rejects early when Content-Length exceeds limit (before buffering)", async () => {
      const body = JSON.stringify({ foo: "bar" });
      const req = new Request("https://example.com/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "content-length": "9999",
        },
        body,
      });
      const result = await readJsonWithLimit(req, 10);
      expect(result).toEqual({ ok: false, tooLarge: true });
    });

    it("proceeds normally when Content-Length is within limit", async () => {
      const body = JSON.stringify({ foo: "bar" });
      const req = new Request("https://example.com/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "content-length": String(body.length),
        },
        body,
      });
      const result = await readJsonWithLimit(req, 1024);
      expect(result).toMatchObject({ ok: true });
    });

    it("falls through to byteLength check when Content-Length is absent", async () => {
      // makeRequest does not set Content-Length; byteLength check still catches it
      const body = "x".repeat(100);
      const req = makeRequest(body);
      const result = await readJsonWithLimit(req, 10);
      expect(result).toEqual({ ok: false, tooLarge: true });
    });
  });
});
