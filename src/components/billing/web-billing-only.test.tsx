import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebBillingOnly } from "./web-billing-only";

let mockNative = false;
vi.mock("@/lib/native/native-shell", () => ({
  useIsNativeShell: () => mockNative,
}));

beforeEach(() => {
  mockNative = false;
});

describe("WebBillingOnly", () => {
  it("nel browser rende i figli", () => {
    render(
      <WebBillingOnly nativeFallback={<span>neutro</span>}>
        <a href="/dashboard/settings#billing">Passa a Pro</a>
      </WebBillingOnly>,
    );
    expect(
      screen.getByRole("link", { name: "Passa a Pro" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("neutro")).not.toBeInTheDocument();
  });

  it("nel guscio nativo rende il fallback al posto dei figli", () => {
    mockNative = true;
    render(
      <WebBillingOnly nativeFallback={<span>neutro</span>}>
        <a href="/dashboard/settings#billing">Passa a Pro</a>
      </WebBillingOnly>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("neutro")).toBeInTheDocument();
  });

  it("nel guscio nativo senza fallback non rende nulla", () => {
    mockNative = true;
    const { container } = render(
      <WebBillingOnly>
        <a href="/dashboard/settings#billing">Passa a Pro</a>
      </WebBillingOnly>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
