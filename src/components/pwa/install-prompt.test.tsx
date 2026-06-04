// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallPrompt } from "./install-prompt";
import { resetInstallPromptStoreForTests } from "@/lib/pwa/install-prompt-store";

const DISMISSED_KEY = "pwa-install-dismissed";
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const ORIGINAL_UA = navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

describe("PwaInstallPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    resetInstallPromptStoreForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setUserAgent(ORIGINAL_UA);
    localStorage.clear();
    resetInstallPromptStoreForTests();
  });

  it("non renderizza nulla su browser non-iOS senza evento install", () => {
    const { container } = render(<PwaInstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("mostra il banner iOS e persiste il dismiss in localStorage", () => {
    setUserAgent(IOS_UA);
    render(<PwaInstallPrompt />);

    expect(screen.getByText("Installa ScontrinoZero")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Non ora"));

    expect(
      screen.queryByText("Installa ScontrinoZero"),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("non mostra il banner iOS se l'utente ha già fatto dismiss", () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setUserAgent(IOS_UA);

    const { container } = render(<PwaInstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("non lancia se l'accesso a localStorage è negato (SecurityError)", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });
    setUserAgent(IOS_UA);

    expect(() => render(<PwaInstallPrompt />)).not.toThrow();
  });
});
