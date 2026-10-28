// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AdeCredentialsRejectedEmail,
  adeCredentialsRejectedSubject,
} from "./ade-credentials-rejected";

const SETTINGS_URL = "https://app.test/dashboard/settings";

function render(
  props: Partial<Parameters<typeof AdeCredentialsRejectedEmail>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(AdeCredentialsRejectedEmail, {
      businessName: "Bar Centrale",
      outcome: "password_expired",
      settingsUrl: SETTINGS_URL,
      ...props,
    }),
  );
}

describe("adeCredentialsRejectedSubject", () => {
  it.each([
    ["password_expired", "La password Fisconline di Bar Centrale è scaduta"],
    ["account_locked", "L'utenza Fisconline di Bar Centrale è bloccata"],
    [
      "auth_error",
      "L'Agenzia delle Entrate rifiuta le credenziali Fisconline di Bar Centrale",
    ],
  ] as const)("per %s dice cosa è successo", (outcome, subject) => {
    expect(adeCredentialsRejectedSubject(outcome, "Bar Centrale")).toBe(
      subject,
    );
  });

  it("senza nome dell'attività non lascia un buco", () => {
    expect(adeCredentialsRejectedSubject("password_expired", null)).toBe(
      "La password Fisconline dell'attività è scaduta",
    );
  });
});

describe("AdeCredentialsRejectedEmail", () => {
  it("dice che emissioni, annulli e resi sono fermi anche per i collaboratori", () => {
    expect(render()).toContain(
      "né tu né i collaboratori potete emettere, annullare o fare resi",
    );
  });

  it("porta alle impostazioni", () => {
    expect(render()).toContain(`href="${SETTINGS_URL}"`);
  });

  it("con la password scaduta suggerisce di cambiarla dall'app", () => {
    expect(render({ outcome: "password_expired" })).toContain(
      "Puoi cambiarla dalle impostazioni",
    );
  });

  it("con l'utenza bloccata manda al portale, perché i dati sono giusti", () => {
    const html = render({ outcome: "account_locked" });
    expect(html).toContain("portale dell&#x27;Agenzia delle Entrate");
    expect(html).not.toContain("Puoi cambiarla dalle impostazioni");
  });

  it("con le credenziali rifiutate ipotizza un cambio fatto sul portale", () => {
    expect(render({ outcome: "auth_error" })).toContain("cambiata sul portale");
  });
});
