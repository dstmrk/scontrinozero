import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { RefreshOnSuccess } from "@/components/billing/refresh-on-success";

describe("RefreshOnSuccess", () => {
  afterEach(() => {
    mockRefresh.mockClear();
  });

  it("calls router.refresh exactly once when active=true", () => {
    render(<RefreshOnSuccess active />);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not call router.refresh when active=false", () => {
    render(<RefreshOnSuccess active={false} />);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("renders nothing visible (returns null)", () => {
    const { container } = render(<RefreshOnSuccess active />);
    expect(container.firstChild).toBeNull();
  });
});
