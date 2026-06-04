// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInfo = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: { info: mockInfo, warn: mockWarn, error: mockError },
}));

vi.mock("@/lib/version", () => ({
  getAppRelease: () => "scontrinozero@1.3.6+abc1234",
}));

const ORIGINAL_TOKEN = process.env.SENTRY_SENTINEL_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.SENTRY_SENTINEL_TOKEN;
  } else {
    process.env.SENTRY_SENTINEL_TOKEN = ORIGINAL_TOKEN;
  }
});

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request(
    "https://app.scontrinozero.it/api/_debug/sentry-sentinel",
    { method: "GET", headers },
  );
}

describe("GET /api/_debug/sentry-sentinel", () => {
  describe("auth gating (nascondi l'endpoint a chi non ha il secret)", () => {
    it("returns 404 when SENTRY_SENTINEL_TOKEN env is not configured", async () => {
      delete process.env.SENTRY_SENTINEL_TOKEN;
      const { GET } = await import("./route");
      const res = await GET(buildRequest({ "x-sentinel-token": "anything" }));
      expect(res.status).toBe(404);
      expect(mockInfo).not.toHaveBeenCalled();
      expect(mockWarn).not.toHaveBeenCalled();
      expect(mockError).not.toHaveBeenCalled();
    });

    it("returns 404 when SENTRY_SENTINEL_TOKEN is set but no header is sent", async () => {
      process.env.SENTRY_SENTINEL_TOKEN = "s3cret-token";
      const { GET } = await import("./route");
      const res = await GET(buildRequest());
      expect(res.status).toBe(404);
      expect(mockError).not.toHaveBeenCalled();
    });

    it("returns 404 when the header value does not match the env token", async () => {
      process.env.SENTRY_SENTINEL_TOKEN = "s3cret-token";
      const { GET } = await import("./route");
      const res = await GET(buildRequest({ "x-sentinel-token": "wrong" }));
      expect(res.status).toBe(404);
      expect(mockError).not.toHaveBeenCalled();
    });

    it("returns 404 when env token is set to an empty string (treat as missing)", async () => {
      // Same gotcha as regola 18: present-but-empty env must not unlock the
      // endpoint, otherwise a misconfigured Dockerfile (ARG not passed) would
      // expose the sentinel publicly.
      process.env.SENTRY_SENTINEL_TOKEN = "";
      const { GET } = await import("./route");
      const res = await GET(buildRequest({ "x-sentinel-token": "" }));
      expect(res.status).toBe(404);
      expect(mockError).not.toHaveBeenCalled();
    });
  });

  describe("when authorised", () => {
    beforeEach(() => {
      process.env.SENTRY_SENTINEL_TOKEN = "s3cret-token";
    });

    it("emits a triple log (info, warn, error) tagged with errorClass 'sentinel'", async () => {
      const { GET } = await import("./route");
      await GET(buildRequest({ "x-sentinel-token": "s3cret-token" }));

      // info: validates that pino → Sentry Logs drain works for level 30
      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          sentinelId: expect.any(String),
          errorClass: "sentinel",
        }),
        expect.stringContaining("sentry-sentinel"),
      );
      // warn: validates level 40 (no Sentry issue, only Sentry Logs)
      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({ errorClass: "sentinel" }),
        expect.stringContaining("sentry-sentinel"),
      );
      // error: validates level 50 → BOTH Sentry Logs AND Sentry issue.
      // err field is required so logger.ts captureToSentry forwards as exception.
      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({
          sentinelId: expect.any(String),
          errorClass: "sentinel",
          err: expect.any(Error),
        }),
        expect.stringContaining("sentry-sentinel"),
      );
    });

    it("emits all three logs with the same sentinelId so they can be correlated in Sentry", async () => {
      const { GET } = await import("./route");
      await GET(buildRequest({ "x-sentinel-token": "s3cret-token" }));

      const infoId = (mockInfo.mock.calls[0]?.[0] as { sentinelId: string })
        .sentinelId;
      const warnId = (mockWarn.mock.calls[0]?.[0] as { sentinelId: string })
        .sentinelId;
      const errorId = (mockError.mock.calls[0]?.[0] as { sentinelId: string })
        .sentinelId;
      expect(infoId).toBeTruthy();
      expect(warnId).toBe(infoId);
      expect(errorId).toBe(infoId);
    });

    it("accepts a caller-provided sentinelId via query string", async () => {
      // Lets the operator script (or CI) pre-generate the ID and grep Sentry
      // immediately, without parsing the response body.
      const req = new Request(
        "https://app.scontrinozero.it/api/_debug/sentry-sentinel?id=ci-deploy-v1.3.6",
        {
          method: "GET",
          headers: { "x-sentinel-token": "s3cret-token" },
        },
      );
      const { GET } = await import("./route");
      const res = await GET(req);
      const body = (await res.json()) as { sentinelId: string };
      expect(body.sentinelId).toBe("ci-deploy-v1.3.6");
      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({ sentinelId: "ci-deploy-v1.3.6" }),
        expect.anything(),
      );
    });

    it("falls back to a generated sentinelId when no query is provided", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        buildRequest({ "x-sentinel-token": "s3cret-token" }),
      );
      const body = (await res.json()) as { sentinelId: string };
      expect(body.sentinelId).toMatch(/^[0-9a-f-]{8,}/); // crypto.randomUUID()
    });

    it("returns 200 with sentinelId, release, and a Sentry query hint", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        buildRequest({ "x-sentinel-token": "s3cret-token" }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        sentinelId: string;
        release: string;
        sentryQuery: string;
      };
      expect(body.ok).toBe(true);
      expect(body.release).toBe("scontrinozero@1.3.6+abc1234");
      expect(body.sentryQuery).toContain("errorClass:sentinel");
      expect(body.sentryQuery).toContain(body.sentinelId);
    });

    it("rejects an empty header value even if env token is set (timing-safe match)", async () => {
      const { GET } = await import("./route");
      const res = await GET(buildRequest({ "x-sentinel-token": "" }));
      expect(res.status).toBe(404);
      expect(mockError).not.toHaveBeenCalled();
    });
  });
});
