// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementBanner } from "./announcement-banner";

const DISMISS_KEY = "announcement-dismissed:abc123";

describe("AnnouncementBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("rende il messaggio dell'annuncio", () => {
    render(
      <AnnouncementBanner
        message="Manutenzione programmata"
        level="warning"
        dismissible
        dismissKey={DISMISS_KEY}
      />,
    );

    expect(screen.getByText("Manutenzione programmata")).toBeInTheDocument();
  });

  it("chiude il banner e persiste il dismiss in localStorage", () => {
    render(
      <AnnouncementBanner
        message="Avviso"
        level="info"
        dismissible
        dismissKey={DISMISS_KEY}
      />,
    );

    fireEvent.click(screen.getByLabelText("Chiudi"));

    expect(screen.queryByText("Avviso")).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("1");
  });

  it("non rende nulla se già dismesso in precedenza", () => {
    localStorage.setItem(DISMISS_KEY, "1");

    const { container } = render(
      <AnnouncementBanner
        message="Avviso"
        level="info"
        dismissible
        dismissKey={DISMISS_KEY}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("un dismissKey diverso fa ricomparire il banner", () => {
    localStorage.setItem(DISMISS_KEY, "1");

    render(
      <AnnouncementBanner
        message="Nuovo avviso"
        level="info"
        dismissible
        dismissKey="announcement-dismissed:different"
      />,
    );

    expect(screen.getByText("Nuovo avviso")).toBeInTheDocument();
  });

  it("livello critical: nessun bottone Chiudi e ignora il dismiss salvato", () => {
    localStorage.setItem(DISMISS_KEY, "1");

    render(
      <AnnouncementBanner
        message="Incidente in corso"
        level="critical"
        dismissible={false}
        dismissKey={DISMISS_KEY}
      />,
    );

    expect(screen.getByText("Incidente in corso")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chiudi")).not.toBeInTheDocument();
  });

  it("non lancia se l'accesso a localStorage è negato (SecurityError)", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });

    expect(() =>
      render(
        <AnnouncementBanner
          message="Avviso"
          level="info"
          dismissible
          dismissKey={DISMISS_KEY}
        />,
      ),
    ).not.toThrow();
  });
});
