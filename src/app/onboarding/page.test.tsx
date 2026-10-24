// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOnboardingStatus, mockRedirect } = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  // `redirect()` di Next funziona LANCIANDO NEXT_REDIRECT: il mock replica il
  // throw, così la pagina non prosegue dopo il redirect.
  mockRedirect: vi.fn((..._args: unknown[]) => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: () => mockGetOnboardingStatus(),
}));

vi.mock("./onboarding-form", () => ({
  OnboardingForm: (props: {
    initialStep: number;
    initialBusinessId: string | null;
  }) => (
    <div
      data-testid="onboarding-form"
      data-step={props.initialStep}
      data-business={props.initialBusinessId ?? ""}
    />
  ),
}));

import OnboardingPage from "./page";

const BIZ_ID = "11111111-1111-4111-8111-111111111111";

function status(overrides: Record<string, unknown>) {
  return {
    hasBusiness: false,
    hasCredentials: false,
    credentialsVerified: false,
    hasUtenzaPiva: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingPage", () => {
  it("riprende dal primo passo senza attività", async () => {
    mockGetOnboardingStatus.mockResolvedValue(status({}));

    render(await OnboardingPage());

    const form = screen.getByTestId("onboarding-form");
    expect(form.dataset.step).toBe("0");
    expect(form.dataset.business).toBe("");
  });

  it("riprende dalle credenziali con l'attività salvata", async () => {
    mockGetOnboardingStatus.mockResolvedValue(
      status({
        hasBusiness: true,
        businessId: BIZ_ID,
        membership: { memberId: "member-owner", role: "owner" },
      }),
    );

    render(await OnboardingPage());

    const form = screen.getByTestId("onboarding-form");
    expect(form.dataset.step).toBe("1");
    expect(form.dataset.business).toBe(BIZ_ID);
  });

  it("riprende dalla verifica con le credenziali salvate", async () => {
    mockGetOnboardingStatus.mockResolvedValue(
      status({
        hasBusiness: true,
        businessId: BIZ_ID,
        membership: { memberId: "member-owner", role: "owner" },
        hasCredentials: true,
      }),
    );

    render(await OnboardingPage());

    expect(screen.getByTestId("onboarding-form").dataset.step).toBe("2");
  });

  it("a onboarding finito rimanda al dashboard", async () => {
    mockGetOnboardingStatus.mockResolvedValue(
      status({
        hasBusiness: true,
        businessId: BIZ_ID,
        membership: { memberId: "member-owner", role: "owner" },
        hasCredentials: true,
        credentialsVerified: true,
      }),
    );

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("il collaboratore non fa l'onboarding, anche con le credenziali del titolare da verificare", async () => {
    mockGetOnboardingStatus.mockResolvedValue(
      status({
        hasBusiness: true,
        businessId: BIZ_ID,
        membership: { memberId: "member-collab", role: "collaborator" },
        hasCredentials: true,
        credentialsVerified: false,
      }),
    );

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
