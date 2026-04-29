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

  it("renders a CTA link to /register", () => {
    render(<RelatedHelpArticles slug="primo-scontrino" />);
    const cta = screen.getByRole("link", {
      name: /crea l'account|crea l’account/i,
    });
    expect(cta.getAttribute("href")).toBe("/register");
  });

  it("throws for an unknown slug", () => {
    expect(() => render(<RelatedHelpArticles slug="unknown" />)).toThrow();
  });
});
