// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CollaboratorSuspendedEmail,
  collaboratorSuspendedSubject,
} from "./collaborator-suspended";

function render(businessName: string | null = "Bar Centrale") {
  return renderToStaticMarkup(
    createElement(CollaboratorSuspendedEmail, { businessName }),
  );
}

describe("collaboratorSuspendedSubject", () => {
  it("nomina l'attività", () => {
    expect(collaboratorSuspendedSubject("Bar Centrale")).toBe(
      "Il piano di Bar Centrale non include più i collaboratori",
    );
  });

  it("senza nome non lascia un buco", () => {
    expect(collaboratorSuspendedSubject(null)).toBe(
      "Il piano dell'attività non include più i collaboratori",
    );
  });
});

describe("CollaboratorSuspendedEmail", () => {
  it("dice cosa non può fare e cosa gli resta", () => {
    const html = render();
    expect(html).toContain(
      "per ora non puoi emettere scontrini, annullarli o fare resi",
    );
    expect(html).toContain("scaricarne i PDF");
  });

  it("dice che l'account resta e si riattiva con Team", () => {
    expect(render()).toContain("piano Team");
  });

  it("manda dal titolare, senza inviti all'acquisto", () => {
    // Decisione 18 della issue #1099: al collaboratore mai una CTA d'acquisto.
    const html = render();
    expect(html).toContain("chiedi al titolare");
    expect(html).not.toMatch(/<a[^>]+href/);
    expect(html).not.toMatch(/Passa a|abbonati|acquista/i);
  });
});
