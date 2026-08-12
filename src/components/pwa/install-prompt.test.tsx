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

  it("somma la safe-area al padding del pannello fisso", () => {
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    const panel = container.querySelector("header");
    expect(panel?.className).toContain(
      "pb-[calc(1rem_+_env(safe-area-inset-bottom))]",
    );
  });

  it("usa i token di tema, non colori hardcoded (leggibile in dark mode)", () => {
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    const panel = container.querySelector("header");
    expect(panel?.className).toContain("bg-background");
    expect(panel?.className).not.toContain("bg-white");
  });

  it("non lancia se l'accesso a localStorage è negato (SecurityError)", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });
    setUserAgent(IOS_UA);

    expect(() => render(<PwaInstallPrompt />)).not.toThrow();
  });
});
