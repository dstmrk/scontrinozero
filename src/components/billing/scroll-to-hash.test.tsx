import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToHash } from "./scroll-to-hash";

describe("ScrollToHash", () => {
  afterEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("scrolls to the element matching the URL hash on mount", () => {
    const target = document.createElement("div");
    target.id = "billing";
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);
    window.location.hash = "#billing";

    render(<ScrollToHash />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("decodes percent-encoded hashes before lookup", () => {
    const target = document.createElement("div");
    target.id = "piano e abbonamento";
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);
    window.location.hash = "#piano%20e%20abbonamento";

    render(<ScrollToHash />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no hash", () => {
    window.location.hash = "";
    const { container } = render(<ScrollToHash />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing when no element matches the hash", () => {
    window.location.hash = "#missing";
    // Non deve lanciare: getElementById torna null, optional chaining no-op.
    expect(() => render(<ScrollToHash />)).not.toThrow();
  });

  it("does not throw on a malformed percent-encoded hash", () => {
    // decodeURIComponent("%E0%A4%A") lancia URIError: l'effect deve degradare
    // al raw senza propagare (niente error boundary).
    window.location.hash = "#%E0%A4%A";
    expect(() => render(<ScrollToHash />)).not.toThrow();
  });

  it("falls back to the raw hash when decoding fails", () => {
    const target = document.createElement("div");
    target.id = "%E0%A4%A";
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);
    window.location.hash = "#%E0%A4%A";

    render(<ScrollToHash />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
