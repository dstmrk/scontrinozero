// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "./header";

describe("marketing Header", () => {
  it("renders the 'Accedi' link as a hard cross-origin URL to the app subdomain", () => {
    render(<Header />);
    const accedi = screen.getByRole("link", { name: /accedi/i });
    const href = accedi.getAttribute("href") ?? "";
    // Forza l'utente a uscire dall'origin marketing prima di vedere /login,
    // così Turnstile carica solo sul dominio app (vedi CLAUDE.md regola #15).
    expect(href.startsWith("http")).toBe(true);
    expect(href.endsWith("/login")).toBe(true);
  });
});
