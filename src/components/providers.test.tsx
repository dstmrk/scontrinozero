import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Providers } from "./providers";

const { mockSerwistProvider, mockInitInstallPromptCapture } = vi.hoisted(
  () => ({
    mockSerwistProvider: vi.fn(),
    mockInitInstallPromptCapture: vi.fn(),
  }),
);

vi.mock("@serwist/next/react", () => ({
  SerwistProvider: (props: Record<string, unknown>) => {
    mockSerwistProvider(props);
    return props.children as React.ReactNode;
  },
}));

vi.mock("@/lib/pwa/install-prompt-store", () => ({
  initInstallPromptCapture: mockInitInstallPromptCapture,
}));

// sonner legge window.matchMedia al mount, che jsdom non espone: irrilevante
// per quello che si asserisce qui.
vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

const serwistProps = () =>
  mockSerwistProvider.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Providers — registrazione del service worker", () => {
  it("registers the service worker built by `serwist build`", () => {
    render(
      <Providers>
        <p>contenuto</p>
      </Providers>,
    );

    expect(serwistProps().swUrl).toBe("/sw.js");
    expect(screen.getByText("contenuto")).toBeInTheDocument();
  });

  it("never reloads the page when the connection comes back", () => {
    // Default di SerwistProvider: true → `location.reload()` sull'evento
    // `online`. Su un POS significa perdere il carrello in corso (righe,
    // codice lotteria) proprio quando la rete torna dopo un buco: è lo
    // scenario più probabile al banco, non un caso limite.
    render(
      <Providers>
        <p>contenuto</p>
      </Providers>,
    );

    expect(serwistProps().reloadOnOnline).toBe(false);
  });

  it("does not monkey-patch history for navigation caching", () => {
    // Default: true → sovrascrive history.pushState/replaceState per cachare
    // le URL navigate. Rischio di interop con il router dell'App Router, e
    // nessun beneficio: le pagine visitate le cacha già la NetworkFirst delle
    // navigazioni di defaultCache.
    render(
      <Providers>
        <p>contenuto</p>
      </Providers>,
    );

    expect(serwistProps().cacheOnNavigation).toBe(false);
  });

  it("disables registration in development, where the SW is never built", () => {
    // `serwist build` è incatenato allo script `build`, non a `dev`: in
    // sviluppo public/sw.js non esiste e registrarlo darebbe un 404 a ogni
    // avvio.
    vi.stubEnv("NODE_ENV", "development");

    render(
      <Providers>
        <p>contenuto</p>
      </Providers>,
    );

    expect(serwistProps().disable).toBe(true);
  });

  it("enables registration in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    render(
      <Providers>
        <p>contenuto</p>
      </Providers>,
    );

    expect(serwistProps().disable).toBe(false);
  });
});
