import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListTeam } = vi.hoisted(() => ({ mockListTeam: vi.fn() }));

vi.mock("@/lib/collaborator-invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/collaborator-invites")>()),
  listTeam: mockListTeam,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Il componente client ha la sua suite: qui conta cosa gli arriva.
vi.mock("@/components/settings/collaborators-section", () => ({
  CollaboratorsSection: (props: unknown) => (
    <pre data-testid="section">{JSON.stringify(props)}</pre>
  ),
}));

import { CollaboratorsCard } from "./collaborators-card";

const BIZ = "11111111-1111-4111-8111-111111111111";
const VERIFIED_FISCONLINE = {
  loginMethod: "fisconline",
  verifiedAt: new Date("2026-10-01T10:00:00Z"),
};
const TEAM = {
  plan: "team",
  trialStartedAt: null,
  planExpiresAt: null,
} as const;
const EMPTY = { members: [], invites: [] };

async function renderCard(
  props: Partial<Parameters<typeof CollaboratorsCard>[0]> = {},
) {
  const element = await CollaboratorsCard({
    businessId: BIZ,
    planInfo: TEAM,
    collaboratorTermsVersion: "v01",
    credentials: VERIFIED_FISCONLINE,
    ...props,
  });
  return render(<>{element}</>);
}

function sectionProps() {
  return JSON.parse(screen.getByTestId("section").textContent ?? "{}");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListTeam.mockResolvedValue(EMPTY);
});

describe("CollaboratorsCard", () => {
  it("passa alla sezione il passo, il limite, ultimi accessi e scadenze in ora italiana", async () => {
    mockListTeam.mockResolvedValue({
      members: [
        {
          id: "m-1",
          name: "Anna",
          email: "anna@example.com",
          // 23:30 UTC del 25 ottobre è già il 26 a Roma.
          lastSeenAt: new Date("2026-10-25T23:30:00Z"),
        },
        {
          id: "m-2",
          name: "Luca",
          email: "luca@example.com",
          lastSeenAt: null,
        },
      ],
      invites: [
        {
          id: "inv-1",
          email: "luca@example.com",
          // 23:30 UTC del 30 ottobre è già il 31 a Roma.
          expiresAt: new Date("2099-10-30T23:30:00Z"),
          expired: false,
        },
        {
          id: "inv-2",
          email: "sara@example.com",
          expiresAt: new Date("2020-01-01T10:00:00Z"),
          expired: true,
        },
      ],
    });

    await renderCard();

    expect(mockListTeam).toHaveBeenCalledWith(BIZ);
    expect(sectionProps()).toEqual({
      businessId: BIZ,
      blocker: null,
      trialLimit: null,
      members: [
        {
          id: "m-1",
          name: "Anna",
          email: "anna@example.com",
          lastSeenLabel: "26/10/2026",
        },
        {
          id: "m-2",
          name: "Luca",
          email: "luca@example.com",
          lastSeenLabel: null,
        },
      ],
      invites: [
        {
          id: "inv-1",
          email: "luca@example.com",
          expired: false,
          expiresLabel: "31/10/2099",
        },
        {
          id: "inv-2",
          email: "sara@example.com",
          expired: true,
          expiresLabel: "01/01/2020",
        },
      ],
    });
  });

  it("nella prova passa il limite", async () => {
    await renderCard({
      planInfo: {
        plan: "trial",
        trialStartedAt: new Date(),
        planExpiresAt: null,
      },
    });

    expect(sectionProps().trialLimit).toBe(2);
  });

  it("senza condizioni accettate il passo è quello delle condizioni", async () => {
    await renderCard({ collaboratorTermsVersion: undefined });

    expect(sectionProps().blocker.step).toBe("terms");
  });

  it("senza credenziali AdE il passo è quello di Fisconline", async () => {
    await renderCard({ credentials: null });

    expect(sectionProps().blocker.step).toBe("fisconline");
  });

  it("non c'è su un piano senza collaboratori e senza nessuno da gestire", async () => {
    const { container } = await renderCard({
      planInfo: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("resta dopo un downgrade, se ci sono inviti da revocare", async () => {
    mockListTeam.mockResolvedValue({
      members: [],
      invites: [
        {
          id: "inv-1",
          email: "luca@example.com",
          expiresAt: new Date("2099-10-30T10:00:00Z"),
          expired: false,
        },
      ],
    });

    await renderCard({
      planInfo: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
    });

    expect(sectionProps().blocker.step).toBe("plan");
  });

  it.each([
    ["senza attività", { businessId: undefined }],
    ["senza piano", { planInfo: null }],
  ])("non c'è %s", async (_label, props) => {
    const { container } = await renderCard(props);

    expect(container).toBeEmptyDOMElement();
    expect(mockListTeam).not.toHaveBeenCalled();
  });

  it("se la lettura fallisce lo dice nella card invece di rompere la pagina", async () => {
    mockListTeam.mockRejectedValue(new Error("DB down"));

    await renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Non riusciamo a caricare i collaboratori. Ricarica la pagina.",
    );
  });
});
