import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISMISSED_KEY = "pwa-install-dismissed";

/** Create a fake BeforeInstallPromptEvent with a mockable .prompt() */
function makeInstallPromptEvent() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.preventDefault = vi.fn();
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  return event;
}

/** Override navigator.userAgent in jsdom (configurable property). */
function stubUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

/** Override navigator.standalone in jsdom. */
function stubStandalone(value: boolean) {
  Object.defineProperty(navigator, "standalone", {
    value,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalUserAgent = navigator.userAgent;

beforeEach(() => {
  localStorage.clear();
  // Reset to non-iOS, non-standalone by default
  stubUserAgent(
    "Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
  );
  // Remove standalone if set
  if ("standalone" in navigator) {
    stubStandalone(false);
  }
});

afterEach(() => {
  stubUserAgent(originalUserAgent);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PwaInstallPrompt", () => {
  describe("dismissed state", () => {
    it("does not render anything when already dismissed", () => {
      localStorage.setItem(DISMISSED_KEY, "1");
      const { container } = render(<PwaInstallPrompt />);
      expect(container.firstChild).toBeNull();
    });

    it("does not show iOS banner when already dismissed", () => {
      localStorage.setItem(DISMISSED_KEY, "1");
      stubUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      );
      stubStandalone(false);
      render(<PwaInstallPrompt />);
      expect(
        screen.queryByText(/aggiungi a schermata home per usarla/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("Android / Chrome install prompt", () => {
    it("does not render before beforeinstallprompt fires", () => {
      const { container } = render(<PwaInstallPrompt />);
      expect(container.firstChild).toBeNull();
    });

    it("shows install banner when beforeinstallprompt fires", async () => {
      render(<PwaInstallPrompt />);
      const event = makeInstallPromptEvent();
      await act(async () => {
        window.dispatchEvent(event);
      });
      expect(
        screen.getByRole("button", { name: /installa/i }),
      ).toBeInTheDocument();
    });

    it("prevents default on beforeinstallprompt to defer the browser prompt", async () => {
      render(<PwaInstallPrompt />);
      const event = makeInstallPromptEvent();
      await act(async () => {
        window.dispatchEvent(event);
      });
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("calls deferredPrompt.prompt() when install button is clicked", async () => {
      render(<PwaInstallPrompt />);
      const event = makeInstallPromptEvent();
      await act(async () => {
        window.dispatchEvent(event);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /installa/i }));
      });
      expect(event.prompt).toHaveBeenCalledOnce();
    });

    it("hides banner after install button is clicked", async () => {
      render(<PwaInstallPrompt />);
      const event = makeInstallPromptEvent();
      await act(async () => {
        window.dispatchEvent(event);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /installa/i }));
      });
      expect(
        screen.queryByRole("button", { name: /installa/i }),
      ).not.toBeInTheDocument();
    });

    it("hides banner and sets localStorage when dismiss button is clicked", async () => {
      render(<PwaInstallPrompt />);
      const event = makeInstallPromptEvent();
      await act(async () => {
        window.dispatchEvent(event);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /non ora/i }));
      });
      expect(
        screen.queryByRole("button", { name: /installa/i }),
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
    });
  });

  describe("iOS install instructions", () => {
    beforeEach(() => {
      stubUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      );
      stubStandalone(false);
    });

    it("shows iOS instructions banner on iPhone not in standalone", () => {
      render(<PwaInstallPrompt />);
      expect(
        screen.getByText(/aggiungi a schermata home per usarla/i),
      ).toBeInTheDocument();
    });

    it("does not show iOS banner when already in standalone mode", () => {
      stubStandalone(true);
      const { container } = render(<PwaInstallPrompt />);
      expect(container.firstChild).toBeNull();
    });

    it("hides iOS banner and sets localStorage when dismiss is clicked", () => {
      render(<PwaInstallPrompt />);
      fireEvent.click(screen.getByRole("button", { name: /non ora/i }));
      expect(
        screen.queryByText(/aggiungi a schermata home per usarla/i),
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
    });
  });
});
