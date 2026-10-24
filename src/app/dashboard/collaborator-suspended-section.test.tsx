// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOnboardingStatus, mockGetAuthenticatedUser, mockGetPlanSafe } =
  vi.hoisted(() => ({
    mockGetOnboardingStatus: vi.fn(),
    mockGetAuthenticatedUser: vi.fn(),
    mockGetPlanSafe: vi.fn(),
  }));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: () => mockGetOnboardingStatus(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}));

vi.mock("@/lib/plans", () => ({
  getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
}));

// `collaboratorSuspendedError` è puro: quello vero, così il gate dei piani
// (`canUseCollaborators`) è esercitato davvero.
vi.mock("@/db", () => ({ getDb: vi.fn() }));

import { CollaboratorSuspendedSection } from "./collaborator-suspended-section";

const BIZ = "biz-uuid";
const COLLABORATOR = {
  memberId: "member-collab",
  role: "collaborator",
} as const;

function planOf(plan: string, trialStartedAt: Date | null = null) {
  return { ok: true, info: { plan, trialStartedAt, planExpiresAt: null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({
    businessId: BIZ,
    membership: COLLABORATOR,
  });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-collab" });
  mockGetPlanSafe.mockResolvedValue(planOf("team"));
});

describe("CollaboratorSuspendedSection", () => {
  it("con il titolare su Team non rende nulla", async () => {
    const { container } = render(await CollaboratorSuspendedSection());

    expect(container).toBeEmptyDOMElement();
    expect(mockGetPlanSafe).toHaveBeenCalledWith(
      "user-collab",
      "collaboratorSuspendedSection",
    );
  });

  it("con il titolare sceso a Pro avvisa che resta la sola lettura", async () => {
    mockGetPlanSafe.mockResolvedValue(planOf("pro"));

    render(await CollaboratorSuspendedSection());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/non ti permette di emettere/);
    expect(alert).toHaveTextContent(/consultare i tuoi scontrini/);
    expect(alert).toHaveTextContent(/chiedi al titolare/);
  });

  it("con la prova del titolare scaduta avvisa allo stesso modo", async () => {
    mockGetPlanSafe.mockResolvedValue(
      planOf("trial", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)),
    );

    render(await CollaboratorSuspendedSection());

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("al titolare non rende nulla e non legge il piano", async () => {
    mockGetOnboardingStatus.mockResolvedValue({
      businessId: BIZ,
      membership: { memberId: "member-owner", role: "owner" },
    });

    const { container } = render(await CollaboratorSuspendedSection());

    expect(container).toBeEmptyDOMElement();
    expect(mockGetPlanSafe).not.toHaveBeenCalled();
  });

  it("se il piano non si legge non rende nulla, senza propagare", async () => {
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "DB giù" });

    const { container } = render(await CollaboratorSuspendedSection());

    expect(container).toBeEmptyDOMElement();
  });
});
