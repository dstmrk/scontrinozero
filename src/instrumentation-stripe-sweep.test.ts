// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STRIPE_WEBHOOK_EVENT_RETENTION_MS,
  STUCK_WEBHOOK_CLAIM_THRESHOLD_MS,
} from "./instrumentation";

const { mockGetDb, mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));

vi.mock("@/lib/logger", () => ({
  logger: { info: mockLoggerInfo, warn: mockLoggerWarn },
}));

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: vi.fn(),
}));

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const dialect = new PgDialect();

/** Rende una condizione Drizzle in SQL + params per asserirla testualmente. */
function render(condition: SQL) {
  const { sql, params } = dialect.sqlToQuery(condition);
  return { sql, params };
}

describe("costanti dello sweep stripe_webhook_events", () => {
  it("la soglia claim stuck vale 30 minuti", () => {
    expect(STUCK_WEBHOOK_CLAIM_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });

  it("la retention degli eventi completati vale 30 giorni", () => {
    // ~10× la finestra massima di retry di Stripe (~3 giorni): nessun rischio
    // di riaprire la porta al riprocessamento di un evento legittimo.
    expect(STRIPE_WEBHOOK_EVENT_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("startStripeWebhookClaimSweep()", () => {
  let capturedCallback: (() => Promise<void>) | undefined;
  let capturedConditions: SQL[];
  let mockUnref: ReturnType<typeof vi.fn>;
  let mockReturning: ReturnType<typeof vi.fn>;
  let retentionResult: { count: number };
  let whereShouldThrow: Error | undefined;
  let startStripeWebhookClaimSweep: () => void;

  beforeEach(async () => {
    // Reset dello stato module-level (guardia di idempotenza) tra i test.
    vi.resetModules();
    ({ startStripeWebhookClaimSweep } = await import("./instrumentation"));

    capturedConditions = [];
    whereShouldThrow = undefined;
    retentionResult = { count: 0 };
    mockReturning = vi.fn().mockResolvedValue([]);

    mockUnref = vi.fn();
    const mockTimer = { unref: mockUnref } as unknown as ReturnType<
      typeof setInterval
    >;
    vi.spyOn(global, "setInterval").mockImplementation((callback) => {
      capturedCallback = callback as () => Promise<void>;
      return mockTimer;
    });

    const mockWhere = vi.fn((condition: SQL) => {
      capturedConditions.push(condition);
      if (whereShouldThrow) throw whereShouldThrow;
      // La stessa value serve sia il ramo `.returning()` (claim stuck) sia
      // l'await diretto (retention, che legge solo `count` dal driver).
      return Object.assign(Promise.resolve(retentionResult), {
        returning: mockReturning,
      });
    });
    mockGetDb.mockReturnValue({ delete: vi.fn(() => ({ where: mockWhere })) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    capturedCallback = undefined;
  });

  it("registra un interval da 10 minuti", () => {
    startStripeWebhookClaimSweep();
    expect(global.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      SWEEP_INTERVAL_MS,
    );
  });

  it("chiama .unref() per non bloccare lo shutdown", () => {
    startStripeWebhookClaimSweep();
    expect(mockUnref).toHaveBeenCalled();
  });

  it("due chiamate consecutive avviano un solo setInterval (idempotenza)", () => {
    startStripeWebhookClaimSweep();
    startStripeWebhookClaimSweep();
    expect(global.setInterval).toHaveBeenCalledOnce();
  });

  it("non tocca il DB prima che scatti il timer", () => {
    startStripeWebhookClaimSweep();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("esegue due DELETE distinte a ogni giro: claim stuck e retention", async () => {
    startStripeWebhookClaimSweep();
    await capturedCallback!();

    expect(capturedConditions).toHaveLength(2);
  });

  it("la DELETE dei claim stuck filtra completed_at IS NULL e processed_at oltre soglia", async () => {
    startStripeWebhookClaimSweep();
    const before = Date.now();
    await capturedCallback!();
    const after = Date.now();

    const { sql, params } = render(capturedConditions[0]);
    expect(sql).toContain(`"completed_at" is null`);
    expect(sql).toContain(`"processed_at" <`);

    const threshold = new Date(params[0] as string).getTime();
    expect(threshold).toBeGreaterThanOrEqual(
      before - STUCK_WEBHOOK_CLAIM_THRESHOLD_MS,
    );
    expect(threshold).toBeLessThanOrEqual(
      after - STUCK_WEBHOOK_CLAIM_THRESHOLD_MS,
    );
  });

  it("la DELETE di retention filtra completed_at IS NOT NULL e oltre 30 giorni", async () => {
    startStripeWebhookClaimSweep();
    const before = Date.now();
    await capturedCallback!();
    const after = Date.now();

    const { sql, params } = render(capturedConditions[1]);
    expect(sql).toContain(`"completed_at" is not null`);
    expect(sql).toContain(`"completed_at" <`);

    const threshold = new Date(params[0] as string).getTime();
    expect(threshold).toBeGreaterThanOrEqual(
      before - STRIPE_WEBHOOK_EVENT_RETENTION_MS,
    );
    expect(threshold).toBeLessThanOrEqual(
      after - STRIPE_WEBHOOK_EVENT_RETENTION_MS,
    );
  });

  it("i due rami non si sovrappongono: la retention non tocca i claim non completati", async () => {
    startStripeWebhookClaimSweep();
    await capturedCallback!();

    const stuck = render(capturedConditions[0]).sql;
    const retention = render(capturedConditions[1]).sql;
    expect(stuck).toContain(`"completed_at" is null`);
    expect(stuck).not.toContain(`"completed_at" is not null`);
    expect(retention).not.toContain(`"completed_at" is null`);
  });

  it("logga warn con gli eventId quando sblocca dei claim stuck", async () => {
    mockReturning.mockResolvedValue([
      { eventId: "evt_1" },
      { eventId: "evt_2" },
    ]);
    startStripeWebhookClaimSweep();
    await capturedCallback!();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { eventIds: ["evt_1", "evt_2"] },
      "Stripe webhook claim sbloccato da sweep automatico",
    );
  });

  it("non logga nulla quando non c'è niente da sbloccare né da eliminare", async () => {
    startStripeWebhookClaimSweep();
    await capturedCallback!();

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it("logga info col conteggio solo quando la retention elimina almeno una riga", async () => {
    retentionResult = { count: 42 };
    startStripeWebhookClaimSweep();
    await capturedCallback!();

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      { deleted: 42 },
      "Retention stripe_webhook_events: righe completate eliminate",
    );
  });

  it("logga warn senza lanciare se lo sweep fallisce", async () => {
    whereShouldThrow = new Error("DB unavailable");
    startStripeWebhookClaimSweep();

    await expect(capturedCallback!()).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { err: whereShouldThrow },
      "Stripe webhook claim sweep fallito",
    );
  });

  it("il callback è rieseguibile a ogni tick del timer", async () => {
    startStripeWebhookClaimSweep();
    await capturedCallback!();
    await capturedCallback!();

    expect(capturedConditions).toHaveLength(4);
  });
});
