// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OgImageTemplate, OG_SIZE } from "./og-image-template";

describe("OG_SIZE", () => {
  it("matches the standard 1200x630 OG image dimensions", () => {
    expect(OG_SIZE.width).toBe(1200);
    expect(OG_SIZE.height).toBe(630);
  });
});

describe("OgImageTemplate", () => {
  it("renders the title text", () => {
    const html = renderToStaticMarkup(<OgImageTemplate title="Prezzi" />);
    expect(html).toContain("Prezzi");
  });

  it("renders the subtitle when provided", () => {
    const html = renderToStaticMarkup(
      <OgImageTemplate
        title="Funzionalità"
        subtitle="Tutto quello che serve"
      />,
    );
    expect(html).toContain("Funzionalità");
    expect(html).toContain("Tutto quello che serve");
  });

  it("does not render any subtitle text when omitted", () => {
    const html = renderToStaticMarkup(<OgImageTemplate title="Solo titolo" />);
    // Heuristic: with no subtitle, the only paragraph-level text is the title itself
    // and the brand name + domain. No leftover placeholder.
    expect(html).toContain("Solo titolo");
    expect(html).not.toContain("undefined");
  });

  it("includes the ScontrinoZero brand mark", () => {
    const html = renderToStaticMarkup(<OgImageTemplate title="Home" />);
    expect(html).toContain("ScontrinoZero");
  });

  it("includes the canonical domain footer", () => {
    const html = renderToStaticMarkup(<OgImageTemplate title="Home" />);
    expect(html).toContain("scontrinozero.it");
  });

  it("uses flex layout (required by next/og ImageResponse)", () => {
    const html = renderToStaticMarkup(<OgImageTemplate title="X" />);
    // Every <div> in the tree that has children must use display:flex
    // (next/og constraint). We check the root container at minimum.
    expect(html).toMatch(/display:\s*flex/);
  });

  it("escapes special characters in the title", () => {
    const html = renderToStaticMarkup(<OgImageTemplate title="A&B <test>" />);
    expect(html).toContain("A&amp;B &lt;test&gt;");
  });
});
