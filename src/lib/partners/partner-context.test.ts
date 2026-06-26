/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// All mock* consts declared before any vi.mock (factories reference them, and
// vi.mock is hoisted above them — TDZ otherwise).
const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockHeadersGet = vi.fn();
const mockLoggerWarn = vi.fn();

// react/cache → identity so the no-arg getPartnerContext doesn't memoise across
// test cases (same pattern as server-auth.test.ts).
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  partners: { slug: "partners.slug", label: "partners.label" },
  profiles: { id: "profiles.id", referralCode: "profiles.referral_code" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => `eq(${String(col)},${String(val)})`),
  and: vi.fn((...args: unknown[]) => `and(${args.join(",")})`),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: mockHeadersGet })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn },
}));

// Dynamic import inside tests (not a static top-level import): the mock*
// consts must be initialised before the SUT pulls in the mocked modules.
async function importSut() {
  return import("./partner-context");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_HOSTNAME", "app.scontrinozero.it");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPartnerBySlug", () => {
  it("returns the partner context joined to the referral code", async () => {
    mockLimit.mockResolvedValueOnce([
      { slug: "nds", label: "x NDS", referralCode: "ABC12345" },
    ]);
    const { getPartnerBySlug } = await importSut();
    const result = await getPartnerBySlug("nds");
    expect(result).toEqual({
      slug: "nds",
      label: "x NDS",
      referralCode: "ABC12345",
    });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("returns null when no active partner matches", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const { getPartnerBySlug } = await importSut();
    expect(await getPartnerBySlug("ghost")).toBeNull();
  });

  it("degrades to null and warns on DB error (no throw)", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const { getPartnerBySlug } = await importSut();
    expect(await getPartnerBySlug("boom")).toBeNull();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "partner_lookup_failed" }),
      expect.any(String),
    );
  });
});

describe("getPartnerContext", () => {
  it("resolves the partner from the request Host header", async () => {
    mockHeadersGet.mockReturnValue("nds-app.scontrinozero.it");
    mockLimit.mockResolvedValueOnce([
      { slug: "nds", label: "x NDS", referralCode: "ABC12345" },
    ]);
    const { getPartnerContext } = await importSut();
    const result = await getPartnerContext();
    expect(result).toEqual({
      slug: "nds",
      label: "x NDS",
      referralCode: "ABC12345",
    });
  });

  it("returns null on the standard app host without querying the DB", async () => {
    mockHeadersGet.mockReturnValue("app.scontrinozero.it");
    const { getPartnerContext } = await importSut();
    expect(await getPartnerContext()).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns null when the request has no Host header", async () => {
    mockHeadersGet.mockReturnValue(null);
    const { getPartnerContext } = await importSut();
    expect(await getPartnerContext()).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
