// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollaboratorInviteEmail } from "./collaborator-invite";

const acceptLink = "https://app.scontrinozero.it/invito/abc_DEF-123";

function render(businessName: string | null = "Bar Centrale") {
  return renderToStaticMarkup(
    createElement(CollaboratorInviteEmail, {
      businessName,
      acceptLink,
      // 23:30 UTC del 30 ottobre è già il 31 a Roma.
      expiresAt: new Date("2026-10-30T23:30:00Z"),
    }),
  );
}

describe("CollaboratorInviteEmail", () => {
  it("dice quale attività invita", () => {
    expect(render()).toContain("Bar Centrale");
  });

  it("senza nome dell'attività resta leggibile", () => {
    const html = render(null);

    expect(html).toContain("un&#x27;attività");
    expect(html).not.toContain("null");
  });

  it("porta il link nel pulsante e in chiaro", () => {
    const html = render();

    expect(html).toContain(`href="${acceptLink}"`);
    expect(html).toContain(`>${acceptLink}<`);
  });

  it("dice fino a quando vale l'invito, nel fuso di Roma", () => {
    expect(render()).toContain("31 ottobre 2026");
  });

  it("spiega cosa fare a chi non conosce l'attività", () => {
    expect(render()).toContain("ignora questa email");
  });
});
