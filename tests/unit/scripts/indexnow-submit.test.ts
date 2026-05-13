// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INDEXNOW_KEY,
  buildPayload,
  runFromCli,
  submitToIndexNow,
} from "../../../scripts/indexnow-submit";

describe("INDEXNOW_KEY", () => {
  it("is a 32-char lowercase hex string", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("buildPayload", () => {
  it("constructs an IndexNow payload with host, key, keyLocation and urlList", () => {
    const payload = buildPayload("https://scontrinozero.it", [
      "https://scontrinozero.it/",
      "https://scontrinozero.it/prezzi",
    ]);

    expect(payload).toEqual({
      host: "scontrinozero.it",
      key: INDEXNOW_KEY,
      keyLocation: `https://scontrinozero.it/${INDEXNOW_KEY}.txt`,
      urlList: ["https://scontrinozero.it/", "https://scontrinozero.it/prezzi"],
    });
  });

  it("derives host from baseUrl even when it has a trailing slash", () => {
    const payload = buildPayload("https://sandbox.scontrinozero.it/", []);
    expect(payload.host).toBe("sandbox.scontrinozero.it");
    expect(payload.keyLocation).toBe(
      `https://sandbox.scontrinozero.it/${INDEXNOW_KEY}.txt`,
    );
  });

  it("throws on malformed baseUrl", () => {
    expect(() => buildPayload("not-a-url", [])).toThrow();
  });
});

describe("submitToIndexNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the payload as JSON to api.indexnow.org and returns ok=true on 200", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("OK", { status: 200 }));

    const payload = buildPayload("https://scontrinozero.it", [
      "https://scontrinozero.it/",
    ]);
    const result = await submitToIndexNow(payload, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.indexnow.org/indexnow",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json; charset=utf-8",
        }),
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual({ ok: true, status: 200, body: "OK" });
  });

  it("returns ok=true on 202 Accepted (key validation pending)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 202 }));

    const result = await submitToIndexNow(
      buildPayload("https://scontrinozero.it", []),
      mockFetch,
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
  });

  it("returns ok=false on 4xx with body for diagnostics", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response("urls do not belong to host", { status: 422 }),
      );

    const result = await submitToIndexNow(
      buildPayload("https://scontrinozero.it", [
        "https://wrong-host.example.com/foo",
      ]),
      mockFetch,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.body).toContain("do not belong");
  });

  it("propagates network errors from fetch", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      submitToIndexNow(buildPayload("https://scontrinozero.it", []), mockFetch),
    ).rejects.toThrow("ECONNREFUSED");
  });
});

describe("runFromCli", () => {
  it("returns 0 on success and logs the URL count + status", async () => {
    const log = vi.fn();
    const error = vi.fn();
    const submit = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, body: "OK" });

    const code = await runFromCli({
      baseUrl: "https://scontrinozero.it",
      loadUrls: async () => [
        "https://scontrinozero.it/",
        "https://scontrinozero.it/prezzi",
      ],
      submit,
      log,
      error,
    });

    expect(code).toBe(0);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "scontrinozero.it",
        urlList: [
          "https://scontrinozero.it/",
          "https://scontrinozero.it/prezzi",
        ],
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Submitting 2 URLs"),
    );
    expect(log).toHaveBeenCalledWith("OK: status 200");
    expect(error).not.toHaveBeenCalled();
  });

  it("returns 1 and logs the body when IndexNow rejects the submission", async () => {
    const log = vi.fn();
    const error = vi.fn();
    const submit = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422, body: "bad host" });

    const code = await runFromCli({
      baseUrl: "https://scontrinozero.it",
      loadUrls: async () => ["https://scontrinozero.it/"],
      submit,
      log,
      error,
    });

    expect(code).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("status=422"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("bad host"));
  });

  it("propagates errors from loadUrls", async () => {
    const submit = vi.fn();
    await expect(
      runFromCli({
        baseUrl: "https://scontrinozero.it",
        loadUrls: async () => {
          throw new Error("sitemap load failed");
        },
        submit,
        log: vi.fn(),
        error: vi.fn(),
      }),
    ).rejects.toThrow("sitemap load failed");
    expect(submit).not.toHaveBeenCalled();
  });
});
