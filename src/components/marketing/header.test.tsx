// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "./header";

// Un href "di sandbox": `appHref()` chiamata da qui (client) non potrebbe mai
// produrlo, perché post-hydration `APP_HOSTNAME` non esiste nel bundle e
// `NEXT_PUBLIC_APP_URL` e' bakata col valore di produzione. Se i test passano
// con questo valore, l'href arriva davvero dal server parent.
const SANDBOX_LOGIN = "https://sandbox.scontrinozero.it/login";

describe("marketing Header", () => {
  it("renders the 'Accedi' link as a hard cross-origin URL to the app subdomain", () => {
    render(<Header loginHref={SANDBOX_LOGIN} />);
    const accedi = screen.getByRole("link", { name: /accedi/i });
    const href = accedi.getAttribute("href") ?? "";
    // Forza l'utente a uscire dall'origin marketing prima di vedere /login,
    // così Turnstile carica solo sul dominio app (vedi CLAUDE.md regola #15).
    expect(href.startsWith("http")).toBe(true);
    expect(href.endsWith("/login")).toBe(true);
  });

  // REVIEW.md #93 — l'href va calcolato in un server parent e passato come
  // prop: `appHref()` e' server-only in pratica (regola 15). Chiamata da un
  // client component ricadeva sul default hardcoded di produzione, quindi in
  // sandbox/self-hosted l'hydration sostituiva l'href corretto emesso in SSR.
  it("renders exactly the server-computed href, without recomputing it client-side", () => {
    render(<Header loginHref={SANDBOX_LOGIN} />);
    expect(screen.getByRole("link", { name: /accedi/i })).toHaveAttribute(
      "href",
      SANDBOX_LOGIN,
    );
  });

  it("uses the same server-computed href in the mobile menu", () => {
    render(<Header loginHref={SANDBOX_LOGIN} />);
    fireEvent.click(
      screen.getByRole("button", { name: /apri menu di navigazione/i }),
    );
    const links = screen
      .getAllByRole("link", { name: /accedi/i })
      .map((el) => el.getAttribute("href"));
    expect(links).toHaveLength(2);
    expect(new Set(links)).toEqual(new Set([SANDBOX_LOGIN]));
  });
});
