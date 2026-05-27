// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RelatedHelpArticles } from "./related-articles";
import { helpArticles } from "@/lib/help/articles";

describe("RelatedHelpArticles", () => {
  it("renders the 'Articoli correlati' heading", () => {
    render(<RelatedHelpArticles slug="aliquote-iva" />);
    expect(
      screen.getByRole("heading", { name: /articoli correlati/i }),
    ).toBeTruthy();
  });

  it("renders 3 related links to /help/<slug>", () => {
    render(<RelatedHelpArticles slug="aliquote-iva" />);
    const expected = helpArticles["aliquote-iva"].related;
    for (const relSlug of expected) {
      const link = screen.getByRole("link", {
        name: helpArticles[relSlug].title,
      });
      expect(link.getAttribute("href")).toBe(`/help/${relSlug}`);
    }
  });

  it("renders a CTA link to /register on the app subdomain (hard cross-origin)", () => {
    render(<RelatedHelpArticles slug="primo-scontrino" />);
    const cta = screen.getByRole("link", {
      name: /crea l'account|crea l’account/i,
    });
    // Deve essere un URL assoluto verso il subdomain app, non un path relativo,
    // così il browser fa hard navigation e il widget Turnstile carica solo
    // sul dominio app (vedi regola #15 in CLAUDE.md).
    const href = cta.getAttribute("href") ?? "";
    expect(href.endsWith("/register")).toBe(true);
    expect(href.startsWith("http")).toBe(true);
  });

  it("throws for an unknown slug", () => {
    expect(() => render(<RelatedHelpArticles slug="unknown" />)).toThrow();
  });
});
