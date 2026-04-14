// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockRedirect,
  mockGetUser,
  mockGetProfilePlan,
  mockCanUseApi,
  mockIsTrialExpired,
  mockGetDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetProfilePlan: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockIsTrialExpired: vi.fn(),
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/server/billing-actions", () => ({
  getProfilePlan: mockGetProfilePlan,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
  isTrialExpired: mockIsTrialExpired,
  TRIAL_DAYS: 30,
}));

vi.mock("@/lib/stripe", () => ({
  PRICE_IDS: {
    starterMonthly: "price_starter_monthly",
    starterYearly: "price_starter_yearly",
    proMonthly: "price_pro_monthly",
    proYearly: "price_pro_yearly",
  },
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
  adeCredentials: "adeCredentials-table",
}));

// Mock all UI components to return null (no-op in node environment)
vi.mock("@/components/ui/card", () => ({
  Card: () => null,
  CardContent: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));
vi.mock("@/components/billing/plan-badge", () => ({
  PlanBadge: () => null,
}));
vi.mock("@/components/billing/plan-selection", () => ({
  PlanSelection: vi.fn(() => null),
}));
vi.mock("@/components/settings/api-key-section", () => ({
  ApiKeySection: vi.fn(() => null),
}));
vi.mock("@/components/settings/ade-credentials-section", () => ({
  AdeCredentialsSection: () => null,
}));
vi.mock("@/components/settings/export-data-section", () => ({
  ExportDataSection: () => null,
}));
vi.mock("@/components/settings/account-delete-section", () => ({
  AccountDeleteSection: () => null,
}));
vi.mock("@/components/settings/edit-profile-section", () => ({
  EditProfileSection: () => null,
}));
vi.mock("@/components/settings/edit-business-section", () => ({
  EditBusinessSection: () => null,
}));
vi.mock("@/components/settings/change-password-section", () => ({
  ChangePasswordSection: () => null,
}));
vi.mock("@/components/settings/edit-ade-credentials-section", () => ({
  EditAdeCredentialsSection: () => null,
}));
vi.mock("@/types/cassa", () => ({
  VAT_DESCRIPTIONS: {},
  VAT_CODES: [],
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import SettingsPage from "@/app/dashboard/settings/page";
import { PlanSelection } from "@/components/billing/plan-selection";
import { ApiKeySection } from "@/components/settings/api-key-section";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively walks a React JSX tree and returns true if a node matches the predicate. */
function findInJsx(node: unknown, predicate: (n: unknown) => boolean): boolean {
  if (node === null || node === undefined || typeof node !== "object")
    return false;
  if (predicate(node)) return true;
  const el = node as Record<string, unknown>;
  const props = el.props as Record<string, unknown> | undefined;
  if (props?.children) {
    const children = Array.isArray(props.children)
      ? props.children
      : [props.children];
    return children.some((child: unknown) => findInJsx(child, predicate));
  }
  return false;
}

/** Returns true if the JSX tree contains an element of the given component type. */
function hasComponent(jsx: unknown, componentFn: unknown): boolean {
  return findInJsx(jsx, (n) => {
    const el = n as { type?: unknown };
    return el.type === componentFn;
  });
}

/** Returns true if the JSX tree contains an <a> with the given href. */
function hasLink(jsx: unknown, href: string): boolean {
  return findInJsx(jsx, (n) => {
    const el = n as { type?: unknown; props?: Record<string, unknown> };
    return el.type === "a" && el.props?.href === href;
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-test-uuid", email: "test@example.com" };
const FAKE_PROFILE = {
  id: "profile-uuid",
  authUserId: FAKE_USER.id,
  firstName: "Mario",
  lastName: "Rossi",
};
const FAKE_BUSINESS = {
  id: "biz-uuid",
  profileId: FAKE_PROFILE.id,
  businessName: "Test SRL",
  vatNumber: "12345678901",
  fiscalCode: null,
  address: null,
  streetNumber: null,
  city: null,
  province: null,
  zipCode: null,
  preferredVatCode: null,
};

const TRIAL_PLAN_DATA = {
  plan: "trial" as const,
  trialStartedAt: new Date("2026-01-01"),
  planExpiresAt: null,
  hasSubscription: false,
  subscriptionStatus: null,
  subscriptionInterval: null,
};

function makeActivePlanData(
  plan: "starter" | "pro" = "pro",
  interval: "month" | "year" = "year",
) {
  return {
    plan,
    trialStartedAt: new Date("2026-01-01"),
    planExpiresAt: new Date("2027-01-01"),
    hasSubscription: true,
    subscriptionStatus: "active",
    subscriptionInterval: interval,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage — cardState state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user with profile, business, no credentials
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockIsTrialExpired.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(false);

    // DB mock: 3 sequential limit() calls (profiles, businesses, adeCredentials)
    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit
      .mockResolvedValueOnce([FAKE_PROFILE]) // profiles query
      .mockResolvedValueOnce([FAKE_BUSINESS]) // businesses query
      .mockResolvedValueOnce([]); // adeCredentials query
  });

  describe("pending subscription — the reported bug", () => {
    it("shows trial UI (PlanSelection) when subscriptionStatus is pending", async () => {
      mockGetProfilePlan.mockResolvedValue({
        ...TRIAL_PLAN_DATA,
        hasSubscription: true,
        subscriptionStatus: "pending",
        subscriptionInterval: "year",
      });

      const jsx = await SettingsPage();

      expect(hasComponent(jsx, PlanSelection)).toBe(true);
      expect(hasLink(jsx, "/api/stripe/portal")).toBe(false);
    });

    it("hides API keys card when plan is trial with pending subscription", async () => {
      mockGetProfilePlan.mockResolvedValue({
        ...TRIAL_PLAN_DATA,
        hasSubscription: true,
        subscriptionStatus: "pending",
        subscriptionInterval: "year",
      });
      mockCanUseApi.mockReturnValue(false);

      const jsx = await SettingsPage();

      expect(hasComponent(jsx, ApiKeySection)).toBe(false);
    });
  });

  describe("active subscription", () => {
    it("shows portal link and hides PlanSelection when subscriptionStatus is active", async () => {
      mockGetProfilePlan.mockResolvedValue(makeActivePlanData("pro", "year"));

      const jsx = await SettingsPage();

      expect(hasLink(jsx, "/api/stripe/portal")).toBe(true);
      expect(hasComponent(jsx, PlanSelection)).toBe(false);
    });

    it("shows API keys card when plan is pro and canUseApi returns true", async () => {
      mockGetProfilePlan.mockResolvedValue(makeActivePlanData("pro", "year"));
      mockCanUseApi.mockReturnValue(true);

      const jsx = await SettingsPage();

      expect(hasComponent(jsx, ApiKeySection)).toBe(true);
    });

    it("hides API keys card when plan is starter and canUseApi returns false", async () => {
      mockGetProfilePlan.mockResolvedValue(
        makeActivePlanData("starter", "month"),
      );
      mockCanUseApi.mockReturnValue(false);

      const jsx = await SettingsPage();

      expect(hasComponent(jsx, ApiKeySection)).toBe(false);
    });
  });

  describe("non-active subscription statuses fall through to trial state", () => {
    it.each(["incomplete", "canceled"])(
      "shows PlanSelection for subscriptionStatus '%s'",
      async (status) => {
        mockGetProfilePlan.mockResolvedValue({
          ...TRIAL_PLAN_DATA,
          hasSubscription: true,
          subscriptionStatus: status,
          subscriptionInterval: "year",
        });

        const jsx = await SettingsPage();

        expect(hasComponent(jsx, PlanSelection)).toBe(true);
        expect(hasLink(jsx, "/api/stripe/portal")).toBe(false);
      },
    );
  });

  describe("past-due state", () => {
    it("shows past-due portal link when subscriptionStatus is past_due", async () => {
      mockGetProfilePlan.mockResolvedValue({
        ...makeActivePlanData("pro"),
        subscriptionStatus: "past_due",
      });

      const jsx = await SettingsPage();

      // Portal link is present in past-due state (to update payment method)
      expect(hasLink(jsx, "/api/stripe/portal")).toBe(true);
      expect(hasComponent(jsx, PlanSelection)).toBe(false);
    });
  });

  describe("no subscription (pure trial)", () => {
    it("shows PlanSelection when trial is active and no subscription row", async () => {
      mockGetProfilePlan.mockResolvedValue(TRIAL_PLAN_DATA);

      const jsx = await SettingsPage();

      expect(hasComponent(jsx, PlanSelection)).toBe(true);
      expect(hasLink(jsx, "/api/stripe/portal")).toBe(false);
    });

    it("shows PlanSelection when trial is expired and no subscription row", async () => {
      mockIsTrialExpired.mockReturnValue(true);
      mockGetProfilePlan.mockResolvedValue(TRIAL_PLAN_DATA);

      const jsx = await SettingsPage();

      expect(hasComponent(jsx, PlanSelection)).toBe(true);
    });
  });

  describe("unauthenticated user", () => {
    it("redirects to /login when user is null", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      // next/navigation's redirect() throws in production; the mock doesn't,
      // so the page continues and throws on user.id access — catch it.
      try {
        await SettingsPage();
      } catch {
        // expected: page crashes after mocked redirect (null user.id)
      }

      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });
});
