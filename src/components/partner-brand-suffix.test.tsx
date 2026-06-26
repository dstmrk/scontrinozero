/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement } from "react";

const mockGetPartnerContext = vi.fn();
vi.mock("@/lib/partners/partner-context", () => ({
  getPartnerContext: mockGetPartnerContext,
}));

// Dynamic import inside tests so the mock* const initialises before the SUT
// pulls in the mocked partner-context module.
async function importSut() {
  return import("./partner-brand-suffix");
}

beforeEach(() => vi.clearAllMocks());

describe("PartnerBrandSuffix", () => {
  it("renders nothing off a partner subdomain", async () => {
    mockGetPartnerContext.mockResolvedValueOnce(null);
    const { PartnerBrandSuffix } = await importSut();
    const result = await PartnerBrandSuffix();
    expect(result).toBeNull();
  });

  it("renders the partner label on a partner subdomain", async () => {
    mockGetPartnerContext.mockResolvedValueOnce({
      slug: "nds",
      label: "x NDS",
      referralCode: "ABC12345",
    });
    const { PartnerBrandSuffix } = await importSut();
    const result = await PartnerBrandSuffix();
    expect(isValidElement(result)).toBe(true);
    const element = result as React.ReactElement<{ children: string }>;
    expect(element.props.children).toBe("x NDS");
  });
});
