import { describe, expect, it } from "vitest";
import { readJsonWithLimit, readTextWithLimit } from "./request-utils";

function makeRequest(body: string): Request {
  return new Request("https://example.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/**
 * Build a Request whose body is a ReadableStream that emits the given chunks
 * one-by-one. Optionally set a Content-Length header (caller controls whether
 * the declared length matches the actual byte count — useful for testing the
 * "client lied" code paths).
 */
function makeStreamRequest(
  chunks: Uint8Array[],
  options: { contentLength?: number | null } = {},
): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.contentLength !== null && options.contentLength !== undefined) {
    headers["content-length"] = String(options.contentLength);
  }
  return new Request("https://example.com/", {
    method: "POST",
    headers,
    body: stream,
    // @ts-expect-error duplex is required by undici when body is a stream
    duplex: "half",
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

  describe("pre-allocated path (Content-Length present)", () => {
    it("assembles a body split into many small chunks (pre-alloc path)", async () => {
      const payload = JSON.stringify({
        items: Array.from({ length: 50 }, (_, i) => i),
      });
      const bytes = new TextEncoder().encode(payload);
      // Split into 16-byte chunks to simulate pathological chunking.
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < bytes.byteLength; i += 16) {
        chunks.push(bytes.subarray(i, Math.min(i + 16, bytes.byteLength)));
      }
      const req = makeStreamRequest(chunks, {
        contentLength: bytes.byteLength,
      });
      const result = await readJsonWithLimit(req, 4096);
      expect(result).toEqual({ ok: true, data: JSON.parse(payload) });
    });

    it("aborts early when stream delivers more bytes than declared (client lied)", async () => {
      // Declared Content-Length = 5 but stream delivers 100 bytes.
      // maxBytes = 200 → declared+extra still ≤ maxBytes → readError (stream is unreliable).
      const bigChunk = new Uint8Array(100).fill(65);
      const req = makeStreamRequest([bigChunk], { contentLength: 5 });
      const result = await readJsonWithLimit(req, 200);
      expect(result).toEqual({ ok: false, parseError: true });
    });

    it("reports tooLarge when stream over-delivers beyond maxBytes", async () => {
      const bigChunk = new Uint8Array(100).fill(65);
      // Declared 5 (≤ maxBytes=50) but actual 100 > maxBytes → tooLarge.
      const req = makeStreamRequest([bigChunk], { contentLength: 5 });
      const result = await readJsonWithLimit(req, 50);
      expect(result).toEqual({ ok: false, tooLarge: true });
    });

    it("trims trailing unused bytes when stream delivers fewer bytes than declared", async () => {
      // Declared 50 but stream only delivers '{"a":1}' (7 bytes).
      const body = '{"a":1}';
      const chunk = new TextEncoder().encode(body);
      const req = makeStreamRequest([chunk], { contentLength: 50 });
      const result = await readJsonWithLimit(req, 200);
      expect(result).toEqual({ ok: true, data: { a: 1 } });
    });
  });

  describe("streaming fallback (no Content-Length)", () => {
    it("grows buffer correctly across many small chunks", async () => {
      const payload = JSON.stringify({ filler: "x".repeat(8000) });
      const bytes = new TextEncoder().encode(payload);
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < bytes.byteLength; i += 64) {
        chunks.push(bytes.subarray(i, Math.min(i + 64, bytes.byteLength)));
      }
      const req = makeStreamRequest(chunks, { contentLength: null });
      const result = await readJsonWithLimit(req, 32768);
      expect(result).toMatchObject({ ok: true });
    });

    it("aborts on first chunk that pushes total over maxBytes", async () => {
      const c1 = new Uint8Array(50).fill(65);
      const c2 = new Uint8Array(60).fill(66); // total 110 > maxBytes
      const req = makeStreamRequest([c1, c2], { contentLength: null });
      const result = await readJsonWithLimit(req, 100);
      expect(result).toEqual({ ok: false, tooLarge: true });
    });
  });
});

describe("readTextWithLimit", () => {
  it("returns ok with raw text on Content-Length path", async () => {
    const body = "hello world";
    const bytes = new TextEncoder().encode(body);
    const req = makeStreamRequest([bytes], { contentLength: bytes.byteLength });
    const result = await readTextWithLimit(req, 1024);
    expect(result).toEqual({ ok: true, text: "hello world" });
  });

  it("returns ok with raw text on streaming fallback (no Content-Length)", async () => {
    const bytes = new TextEncoder().encode("streaming hello");
    const req = makeStreamRequest([bytes], { contentLength: null });
    const result = await readTextWithLimit(req, 1024);
    expect(result).toEqual({ ok: true, text: "streaming hello" });
  });
});
