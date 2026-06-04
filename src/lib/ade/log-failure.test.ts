// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  AdeAuthError,
  AdeNetworkError,
  AdePasswordExpiredError,
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

  it("routes AdeAuthError to logger.warn with errorClass ade_user_error (no Sentry noise: SCONTRINOZERO-7)", () => {
    // Credenziali Fisconline sbagliate non sono un bug nostro: sono input
    // utente prevedibile, come "password sbagliata" su /login. Vanno
    // loggate per osservabilita' ma NON devono salire a Sentry come issue
    // (regola 21 di CLAUDE.md). Storico: SCONTRINOZERO-7 ha collezionato
    // 23 eventi in 5 settimane prima di essere archiviata come noise.
    logAdeFailure(
      new AdeAuthError(),
      {},
      { transient: "transient", failure: "failed" },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_user_error" }),
      "failed",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("routes AdePasswordExpiredError to logger.warn with errorClass ade_user_error (no Sentry noise)", () => {
    // Stesso ragionamento di AdeAuthError: la password scaduta richiede
    // azione utente sul portale AdE, non e' un bug del nostro sistema.
    logAdeFailure(
      new AdePasswordExpiredError(),
      {},
      { transient: "transient", failure: "failed" },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_user_error" }),
      "failed",
    );
    expect(logger.error).not.toHaveBeenCalled();
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

  it("R23: context.flow injects sentryFingerprint [flow, errorClass] on the error path", () => {
    // SCONTRINOZERO-9 ("wizardTemplate failed 500") e -A ("setUserChoice
    // failed 500") avrebbero dovuto far parte di un singolo group Sentry —
    // entrambe nel flow "onboarding-verify". context.flow fa propagare il
    // fingerprint al logger.error, che lo applica via withScope.
    logAdeFailure(
      new Error("unexpected boom"),
      { businessId: "biz-1", flow: "onboarding-verify" },
      { transient: "transient", failure: "failed" },
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        errorClass: "ade_failure",
        sentryFingerprint: ["onboarding-verify", "ade_failure"],
      }),
      "failed",
    );
  });

  it("R23: context without flow leaves the default Sentry grouping (no fingerprint)", () => {
    logAdeFailure(
      new Error("unexpected boom"),
      { businessId: "biz-1" },
      { transient: "transient", failure: "failed" },
    );

    const payload = (logger.error as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty("sentryFingerprint");
  });

  it("R23: warn path (transient) does NOT receive sentryFingerprint (it never reaches Sentry capture)", () => {
    logAdeFailure(
      new AdePortalError(503, "down"),
      { businessId: "biz-1", flow: "onboarding-verify" },
      { transient: "transient", failure: "failed" },
    );

    const payload = (logger.warn as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty("sentryFingerprint");
  });

  it("R23: warn path (user_error) does NOT receive sentryFingerprint", () => {
    logAdeFailure(
      new AdeAuthError(),
      { businessId: "biz-1", flow: "onboarding-verify" },
      { transient: "transient", failure: "failed" },
    );

    const payload = (logger.warn as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty("sentryFingerprint");
  });

  it("R23: empty/blank flow is ignored (no fingerprint)", () => {
    logAdeFailure(
      new Error("boom"),
      { businessId: "biz-1", flow: "   " },
      { transient: "transient", failure: "failed" },
    );
    const payload = (logger.error as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).not.toHaveProperty("sentryFingerprint");
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
