// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountInactivityWarningEmail } from "./account-inactivity-warning";

const PROPS = {
  firstName: "Mario",
  deletionDate: new Date("2026-08-15T00:00:00.000Z"),
  loginUrl: "https://app.test/login",
  lastActivityAt: new Date("2025-07-07T10:00:00.000Z"),
};

describe("AccountInactivityWarningEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, PROPS),
    );
    expect(html).toBeTruthy();
  });

  it.each([
    {
      name: "saluta l'utente col nome quando presente",
      props: PROPS,
      contains: "Mario",
    },
    {
      name: "non stampa un saluto rotto quando firstName è vuoto",
      props: { ...PROPS, firstName: "" },
      contains: "Ciao,",
    },
    {
      name: "mostra la data di cancellazione in italiano",
      props: PROPS,
      contains: "15 agosto 2026",
    },
    {
      name: "include il link di login per mantenere l'account",
      props: PROPS,
      contains: "https://app.test/login",
    },
  ])("$name", ({ props, contains }) => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, props),
    );
    expect(html).toContain(contains);
  });

  it("indica la data dell'ultima attività invece di una durata fissa", () => {
    // La durata dipende da INACTIVE_USER_DELETE_AFTER_DAYS (90 in dev, 365 di
    // default) e al preavviso l'inattività è ancora sotto la soglia: un "12
    // mesi" scritto nel testo è falso in entrambi i casi.
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, PROPS),
    );
    expect(html).toContain("7 luglio 2025");
    expect(html).not.toContain("12 mesi");
  });
});
