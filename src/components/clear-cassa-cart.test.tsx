import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClearCassaCart } from "./clear-cassa-cart";
import { CASSA_SESSION_KEY } from "@/hooks/use-cassa";

describe("ClearCassaCart", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rimuove cassa_cart da sessionStorage al mount", () => {
    sessionStorage.setItem(
      CASSA_SESSION_KEY,
      JSON.stringify({ lines: [{ id: "1" }], paymentMethod: "PC" }),
    );

    render(<ClearCassaCart />);

    expect(sessionStorage.getItem(CASSA_SESSION_KEY)).toBeNull();
  });

  it("non solleva eccezioni se cassa_cart non esiste", () => {
    expect(() => render(<ClearCassaCart />)).not.toThrow();
    expect(sessionStorage.getItem(CASSA_SESSION_KEY)).toBeNull();
  });

  it("non tocca altre chiavi di sessionStorage", () => {
    sessionStorage.setItem(CASSA_SESSION_KEY, "x");
    sessionStorage.setItem("other_key", "preserve-me");

    render(<ClearCassaCart />);

    expect(sessionStorage.getItem(CASSA_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem("other_key")).toBe("preserve-me");
  });

  it("non renderizza nulla nel DOM", () => {
    const { container } = render(<ClearCassaCart />);
    expect(container.firstChild).toBeNull();
  });

  // SCONTRINOZERO-H: su Chrome Mobile con storage bloccato (privacy/cookie
  // disabilitati), anche solo accedere a `window.sessionStorage` lancia
  // SecurityError (DOMException 18). Il componente è montato nel layout (auth)
  // → /login: deve degradare in silenzio, non propagare l'eccezione.
  it("non solleva se l'accesso a sessionStorage è negato (SecurityError)", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException(
        "Access is denied for this document.",
        "SecurityError",
      );
    });

    expect(() => render(<ClearCassaCart />)).not.toThrow();
  });

  it("non solleva se removeItem lancia SecurityError", () => {
    vi.spyOn(sessionStorage, "removeItem").mockImplementation(() => {
      throw new DOMException(
        "Access is denied for this document.",
        "SecurityError",
      );
    });

    expect(() => render(<ClearCassaCart />)).not.toThrow();
  });
});
