import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ServiceWorkerRegistrar } from "./service-worker-registrar";

const { mockUseSerwist } = vi.hoisted(() => ({
  mockUseSerwist: vi.fn(),
}));

vi.mock("@serwist/next/react", () => ({
  useSerwist: mockUseSerwist,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ServiceWorkerRegistrar", () => {
  it("registers the service worker once mounted", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    mockUseSerwist.mockReturnValue({ serwist: { register } });

    const { container } = render(<ServiceWorkerRegistrar />);

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    // Non rende nulla: è solo l'effetto di registrazione.
    expect(container).toBeEmptyDOMElement();
  });

  it("swallows a rejected registration instead of leaking an unhandled rejection", async () => {
    // Il rigetto che Googlebot (Web Rendering Service) produce sempre:
    // il renderer non supporta i service worker e rigetta con `Rejected`.
    // Senza catch finisce in `window.onunhandledrejection` → issue Sentry
    // (SCONTRINOZERO-X).
    const rejection = new Error("Rejected");
    const register = vi.fn().mockRejectedValue(rejection);
    mockUseSerwist.mockReturnValue({ serwist: { register } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<ServiceWorkerRegistrar />);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]).toContain(rejection);
  });

  it("does nothing when Serwist is unavailable", () => {
    // `SerwistProvider` non crea l'istanza in SSR, con `disable` attivo
    // (sviluppo) o su un browser senza `navigator.serviceWorker`.
    mockUseSerwist.mockReturnValue({ serwist: null });

    const { container } = render(<ServiceWorkerRegistrar />);

    expect(container).toBeEmptyDOMElement();
  });
});
