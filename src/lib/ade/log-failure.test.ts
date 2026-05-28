// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  AdeAuthError,
  AdeNetworkError,
  AdePortalError,
  AdeSpidTimeoutError,
} from "./errors";
import { logger } from "@/lib/logger";
import { logAdeFailure } from "./log-failure";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAdeFailure", () => {
  it("routes AdeNetworkError to logger.warn with errorClass ade_transient", () => {
    logAdeFailure(
      new AdeNetworkError(new Error("ECONNRESET")),
      { businessId: "biz-1" },
      { transient: "op transient", failure: "op failed" },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        errorClass: "ade_transient",
      }),
      "op transient",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("routes AdePortalError 5xx to logger.warn (transient)", () => {
    logAdeFailure(
      new AdePortalError(503, "down"),
      { documentId: "doc-1" },
      { transient: "transient", failure: "failed" },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_transient" }),
      "transient",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("routes AdeSpidTimeoutError to logger.warn (transient)", () => {
    logAdeFailure(
      new AdeSpidTimeoutError(30),
      {},
      { transient: "transient", failure: "failed" },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_transient" }),
      "transient",
    );
  });

  it("routes AdePortalError 4xx to logger.error (permanent: caller error)", () => {
    logAdeFailure(
      new AdePortalError(400, "bad request"),
      {},
      { transient: "transient", failure: "failed" },
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_failure" }),
      "failed",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("routes AdeAuthError to logger.error (permanent: wrong credentials)", () => {
    logAdeFailure(
      new AdeAuthError(),
      {},
      { transient: "transient", failure: "failed" },
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_failure" }),
      "failed",
    );
  });

  it("routes a generic Error to logger.error", () => {
    logAdeFailure(
      new Error("boom"),
      {},
      { transient: "transient", failure: "failed" },
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_failure" }),
      "failed",
    );
  });

  it("forwards arbitrary context fields into the log payload", () => {
    logAdeFailure(
      new Error("boom"),
      {
        documentId: "doc-1",
        businessId: "biz-1",
        recovery: true,
      },
      { transient: "transient", failure: "failed" },
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        businessId: "biz-1",
        recovery: true,
        err: expect.any(Error),
      }),
      "failed",
    );
  });
});
