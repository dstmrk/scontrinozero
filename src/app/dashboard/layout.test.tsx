// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockGetOnboardingStatus,
  mockGetOnboardingTourSeen,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetOnboardingStatus: vi.fn(),
  mockGetOnboardingTourSeen: vi.fn(),
  // `redirect()` di Next funziona LANCIANDO NEXT_REDIRECT.
  mockRedirect: vi.fn((..._args: unknown[]) => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: () => mockGetUser() },
  }),
}));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: () => mockGetOnboardingStatus(),
  getOnboardingTourSeen: () => mockGetOnboardingTourSeen(),
}));

vi.mock("@/server/auth-actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/announcement", () => ({ getAnnouncement: () => null }));

// La nav vera legge il ruolo dal contesto: qui basta una sonda che lo mostri.
vi.mock("@/components/dashboard/header-nav", async () => {
  const { useIsCollaborator } =
    await import("@/components/dashboard/member-role");
  return {
    HeaderNav: function HeaderNav() {
      return (
        <span data-testid="role">
          {useIsCollaborator() ? "collaborator" : "owner"}
        </span>
      );
    },
  };
});
vi.mock("@/components/dashboard/bottom-nav", () => ({
  BottomNav: () => null,
}));
vi.mock("@/components/dashboard/onboarding-tour", () => ({
  OnboardingTour: () => <div data-testid="tour" />,
}));
vi.mock("@/components/announcement/announcement-banner", () => ({
  AnnouncementBanner: () => null,
}));
vi.mock("@/components/pwa/install-prompt", () => ({
  PwaInstallPrompt: () => null,
}));
vi.mock("@/components/partner-brand-suffix", () => ({
  PartnerBrandSuffix: () => null,
}));
vi.mock("./pending-sales-section", () => ({
  PendingSalesSection: () => null,
}));
vi.mock("./ade-identity-section", () => ({
  AdeIdentitySection: () => null,
}));
vi.mock("./collaborator-suspended-section", () => ({
  CollaboratorSuspendedSection: () => <div data-testid="suspended" />,
}));

import DashboardLayout from "./layout";

const BIZ = "11111111-1111-4111-8111-111111111111";
const OWNER = { memberId: "member-owner", role: "owner" } as const;
const COLLABORATOR = {
  memberId: "member-collab",
  role: "collaborator",
} as const;

function status(overrides: Record<string, unknown> = {}) {
  return {
    hasBusiness: true,
    businessId: BIZ,
    membership: OWNER,
    hasCredentials: true,
    credentialsVerified: true,
    hasUtenzaPiva: false,
    ...overrides,
  };
}

const renderLayout = async () =>
  render(await DashboardLayout({ children: <p>contenuto</p> }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockGetOnboardingStatus.mockResolvedValue(status());
  mockGetOnboardingTourSeen.mockResolvedValue(true);
});

describe("DashboardLayout", () => {
  it("senza sessione rimanda al login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(renderLayout()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("il titolare senza credenziali torna all'onboarding", async () => {
    mockGetOnboardingStatus.mockResolvedValue(
      status({ hasCredentials: false, credentialsVerified: false }),
    );

    await expect(renderLayout()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("il titolare vede il tour la prima volta e i figli lo trattano da titolare", async () => {
    mockGetOnboardingTourSeen.mockResolvedValue(false);

    await renderLayout();

    expect(screen.getByText("contenuto")).toBeInTheDocument();
    expect(screen.getByTestId("tour")).toBeInTheDocument();
    expect(screen.getByTestId("role")).toHaveTextContent("owner");
    expect(screen.getByTestId("suspended")).toBeInTheDocument();
  });

  it("il collaboratore non passa dall'onboarding, nemmeno con le credenziali del titolare mancanti", async () => {
    // L'onboarding rimanda il collaboratore al dashboard: un redirect qui
    // farebbe un giro senza fine.
    mockGetOnboardingStatus.mockResolvedValue(
      status({
        membership: COLLABORATOR,
        hasCredentials: false,
        credentialsVerified: false,
      }),
    );

    await renderLayout();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("contenuto")).toBeInTheDocument();
  });

  it("il collaboratore non vede il tour e i figli lo sanno collaboratore", async () => {
    // Il flag "tour visto" sta sul profilo, che il collaboratore non ha: il
    // tour ricomparirebbe a ogni pagina.
    mockGetOnboardingStatus.mockResolvedValue(
      status({ membership: COLLABORATOR }),
    );
    mockGetOnboardingTourSeen.mockResolvedValue(false);

    await renderLayout();

    expect(screen.queryByTestId("tour")).not.toBeInTheDocument();
    expect(mockGetOnboardingTourSeen).not.toHaveBeenCalled();
    expect(screen.getByTestId("role")).toHaveTextContent("collaborator");
  });
});
