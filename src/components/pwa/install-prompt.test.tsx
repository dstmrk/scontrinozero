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

  it("non nomina Safari: su iPhone anche Chrome può aggiungere alla Home", () => {
    // La UA CriOS matcha isIos(): chi usa Chrome su iPhone vede lo stesso
    // banner, e "nella barra di Safari" lo mandava a cercare un'app sbagliata.
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    expect(container.textContent).not.toMatch(/safari/i);
  });

  it("indica dove trovare Condividi e la voce quando non sono a vista (iOS 26+)", () => {
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    // iOS 26 sposta Condividi nel menu ⋯; iOS 27 sposta "Aggiungi alla
    // schermata Home" sotto "Altro". Il testo regge tutte e tre le versioni.
    expect(container.textContent).toContain("⋯");
    expect(container.textContent).toContain("Aggiungi alla schermata Home");
    expect(container.textContent).toContain("Altro");
  });

  it("linka la guida passo passo in una nuova scheda", () => {
    setUserAgent(IOS_UA);
    render(<PwaInstallPrompt />);

    const link = screen.getByRole("link", { name: /guida passo passo/i });
    expect(link).toHaveAttribute("href", "/help/installare-app");
    // Nuova scheda: la scheda dell'app resta aperta sul dominio da cui va
    // fatta l'installazione.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("non mostra il banner iOS se l'utente ha già fatto dismiss", () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setUserAgent(IOS_UA);

    const { container } = render(<PwaInstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("si impila sopra la bottom nav su mobile invece di coprirla", () => {
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    // 4rem = h-16 della nav; l'inset è quella che la nav aggiunge sotto di sé.
    const panel = container.querySelector("header");
    expect(panel?.className).toContain(
      "bottom-[calc(4rem_+_env(safe-area-inset-bottom))]",
    );
  });

  it("torna a filo del bordo da md in su, dove la nav è nascosta", () => {
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    expect(container.querySelector("header")?.className).toContain(
      "md:bottom-0",
    );
  });

  it("compensa la safe-area solo da md, quando non c'è più la nav a farlo", () => {
    setUserAgent(IOS_UA);
    const { container } = render(<PwaInstallPrompt />);

    // Impilato, sommarla di nuovo qui la conterebbe due volte: sotto il
    // pannello c'è la nav, che il padding sulla safe-area ce l'ha già.
    const panel = container.querySelector("header");
    expect(panel?.className).toContain(
      "md:pb-[calc(1rem_+_env(safe-area-inset-bottom))]",
    );
    expect(panel?.className).not.toContain(
      " pb-[calc(1rem_+_env(safe-area-inset-bottom))]",
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
