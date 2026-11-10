// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailLayout, EmailLinkFallback } from "./layout";

function renderLayout(header: "product" | "internal" | "none") {
  return renderToStaticMarkup(
    <EmailLayout preview="Anteprima della mail" header={header}>
      <p>Corpo della mail</p>
    </EmailLayout>,
  );
}

describe("EmailLayout", () => {
  it("renders preview, body and the Italian lang attribute", () => {
    const html = renderLayout("product");

    expect(html).toContain('lang="it"');
    expect(html).toContain("Anteprima della mail");
    expect(html).toContain("<p>Corpo della mail</p>");
  });

  it("product header: brand subtitle and public footer", () => {
    const html = renderLayout("product");

    expect(html).toContain("Registratore di cassa virtuale");
    expect(html).toContain("ScontrinoZero · scontrinozero.it");
    expect(html).not.toContain("Notifica interna");
  });

  it("internal header: operator subtitle and automatic-notification footer", () => {
    const html = renderLayout("internal");

    expect(html).toContain("Notifica interna");
    expect(html).toContain("ScontrinoZero · notifica automatica");
    expect(html).not.toContain("Registratore di cassa virtuale");
    expect(html).not.toContain("scontrinozero.it");
  });

  it("no header: neither subtitle, public footer kept", () => {
    const html = renderLayout("none");

    expect(html).not.toContain("Registratore di cassa virtuale");
    expect(html).not.toContain("Notifica interna");
    expect(html).toContain("ScontrinoZero · scontrinozero.it");
    // Il marchio compare una volta sola: nel footer, non nell'intestazione.
    expect(html.match(/>ScontrinoZero</g)).toBeNull();
  });
});

describe("EmailLinkFallback", () => {
  const href = "https://app.scontrinozero.it/invito/abc?x=1&y=2";

  it("shows the link both as href and as copyable visible text", () => {
    const html = renderToStaticMarkup(
      createElement(EmailLinkFallback, { href }),
    );
    const escaped = href.replaceAll("&", "&amp;");

    expect(html).toContain(`href="${escaped}"`);
    expect(html).toContain(`>${escaped}<`);
    expect(html).toContain("Se il pulsante non funziona");
  });
});
