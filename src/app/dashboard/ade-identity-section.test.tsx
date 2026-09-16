// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOnboardingStatus, mockLoadAdeIdentityMismatches } = vi.hoisted(
  () => ({
    mockGetOnboardingStatus: vi.fn(),
    mockLoadAdeIdentityMismatches: vi.fn(),
  }),
);

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: mockGetOnboardingStatus,
}));

vi.mock("@/lib/services/ade-identity", () => ({
  loadAdeIdentityMismatches: mockLoadAdeIdentityMismatches,
}));

vi.mock("@/components/settings/ade-identity-notice", () => ({
  AdeIdentityNotice: ({
    businessId,
    denominazione,
    sedeLegale,
  }: {
    businessId: string;
    denominazione: { kind: string } | null;
    sedeLegale: { kind: string } | null;
  }) => (
    <div data-testid="notice">
      {businessId}|{denominazione?.kind ?? "-"}|{sedeLegale?.kind ?? "-"}
    </div>
  ),
}));

import { AdeIdentitySection } from "./ade-identity-section";

const BIZ = "biz-uuid";
const DIVERGENTE = {
  denominazione: {
    kind: "divergente",
    current: "Mario Rossi",
    ade: "ACME SRL",
  },
  sedeLegale: null,
};

describe("AdeIdentitySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOnboardingStatus.mockResolvedValue({
      businessId: BIZ,
      hasUtenzaPiva: true,
    });
    mockLoadAdeIdentityMismatches.mockResolvedValue(DIVERGENTE);
  });

  it("monta l'avviso con i verdetti letti", async () => {
    render(await AdeIdentitySection());

    expect(screen.getByTestId("notice")).toHaveTextContent(
      `${BIZ}|divergente|-`,
    );
  });

  // Il costo nel caso normale deve fermarsi alla SELECT: niente markup, niente
  // spazio occupato nello shell di ogni pagina del dashboard.
  it("non rende niente quando non c'è nessuna divergenza", async () => {
    mockLoadAdeIdentityMismatches.mockResolvedValue({
      denominazione: null,
      sedeLegale: null,
    });

    const { container } = render(await AdeIdentitySection());

    expect(container).toBeEmptyDOMElement();
  });

  // Onboarding a metà: non c'è ancora un business su cui confrontare niente, e
  // soprattutto non si spende una query per scoprirlo.
  it("non legge niente senza un business", async () => {
    mockGetOnboardingStatus.mockResolvedValue({
      businessId: undefined,
      hasUtenzaPiva: false,
    });

    const { container } = render(await AdeIdentitySection());

    expect(container).toBeEmptyDOMElement();
    expect(mockLoadAdeIdentityMismatches).not.toHaveBeenCalled();
  });

  // Il gate che rende gratuito il caso normale: senza una P.IVA scelta
  // l'avviso non può accendersi, quindi la lettura mirata non si spende.
  // È la stragrande maggioranza degli account.
  it("non spende la query per chi non ha scelto una P.IVA", async () => {
    mockGetOnboardingStatus.mockResolvedValue({
      businessId: BIZ,
      hasUtenzaPiva: false,
    });

    const { container } = render(await AdeIdentitySection());

    expect(container).toBeEmptyDOMElement();
    expect(mockLoadAdeIdentityMismatches).not.toHaveBeenCalled();
  });

  it("legge l'identità del business che lo status ha già in cache", async () => {
    render(await AdeIdentitySection());

    expect(mockLoadAdeIdentityMismatches).toHaveBeenCalledWith(BIZ);
  });
});
