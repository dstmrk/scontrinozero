import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ClearCassaCart } from "./clear-cassa-cart";
import { CASSA_SESSION_KEY } from "@/hooks/use-cassa";

describe("ClearCassaCart", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
});
