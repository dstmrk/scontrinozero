// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CollaboratorAccessEndedEmail,
  collaboratorAccessEndedSubject,
} from "./collaborator-access-ended";

function render(
  reason: "removed" | "left" | "owner-deleted",
  businessName: string | null = "Bar Centrale",
) {
  return renderToStaticMarkup(
    createElement(CollaboratorAccessEndedEmail, { businessName, reason }),
  );
}

describe("CollaboratorAccessEndedEmail", () => {
  it("rimosso dal titolare: lo dice e tiene i documenti all'attività", () => {
    const html = render("removed");

    expect(html).toContain("Bar Centrale");
    expect(html).toContain("ha rimosso il tuo accesso");
    expect(html).toContain("restano all&#x27;attività");
  });

  it("uscito da solo: conferma la cancellazione", () => {
    const html = render("left");

    expect(html).toContain("Come hai chiesto");
    expect(html).toContain("restano all&#x27;attività");
  });

  // Con l'account del titolare se ne vanno anche i documenti dell'attività:
  // dire che restano sarebbe falso.
  it("titolare cancellato: non promette che i documenti restino", () => {
    const html = render("owner-deleted");

    expect(html).toContain("ha eliminato l&#x27;account dell&#x27;attività");
    expect(html).not.toContain("restano all");
  });

  it("senza nome dell'attività resta leggibile", () => {
    const html = render("removed", null);

    expect(html).toContain("l&#x27;attività");
    expect(html).not.toContain("null");
  });

  it.each([
    ["removed", "Il tuo accesso a Bar Centrale è stato rimosso"],
    ["left", "Il tuo account ScontrinoZero è stato eliminato"],
    [
      "owner-deleted",
      "L'account di Bar Centrale su ScontrinoZero è stato eliminato",
    ],
  ] as const)("oggetto per %s", (reason, subject) => {
    expect(collaboratorAccessEndedSubject(reason, "Bar Centrale")).toBe(
      subject,
    );
  });

  it("oggetto senza nome dell'attività", () => {
    expect(collaboratorAccessEndedSubject("removed", null)).toBe(
      "Il tuo accesso su ScontrinoZero è stato rimosso",
    );
  });
});
