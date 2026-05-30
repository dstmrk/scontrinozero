// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: i mock devono essere inizializzati PRIMA del factory vi.mock
// (hoisted in cima) perché l'import statico di ade-recovery — che importa @/db —
// fa girare il factory durante l'hoisting degli import.
const { mockReturning, mockSet } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  return { mockReturning, mockSet };
});

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({ set: mockSet }),
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
}));

import { claimStaleDocument, getStalePendingThresholdMs } from "./ade-recovery";
import { getDb } from "@/db";

describe("getStalePendingThresholdMs", () => {
  beforeEach(() => {
    delete process.env.STALE_PENDING_THRESHOLD_MINUTES;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 30 minutes (1_800_000 ms) when the env var is unset", () => {
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("honours a positive override in minutes", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "60");
    expect(getStalePendingThresholdMs()).toBe(60 * 60 * 1000);
  });

  it("honours a fractional minute override", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "0.5");
    expect(getStalePendingThresholdMs()).toBe(0.5 * 60 * 1000);
  });

  it("falls back to default on zero (avoids immediate recovery)", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "0");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on negative values", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "-5");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on non-numeric strings", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "abc");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on NaN string", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "NaN");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default when the env var is an empty string", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });
});

describe("claimStaleDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockReset();
  });

  it("ritorna true quando il CAS rivendica esattamente 1 riga (claim vinto)", async () => {
    mockReturning.mockResolvedValue([{ id: "doc-1" }]);

    const won = await claimStaleDocument(getDb(), "doc-1", new Date());

    expect(won).toBe(true);
    // Il claim bumpa updated_at per invalidare lo snapshot dei retry concorrenti.
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    );
  });

  it("ritorna false quando il CAS matcha 0 righe (claim perso da un retry concorrente)", async () => {
    mockReturning.mockResolvedValue([]);

    const won = await claimStaleDocument(getDb(), "doc-1", new Date());

    expect(won).toBe(false);
  });
});
