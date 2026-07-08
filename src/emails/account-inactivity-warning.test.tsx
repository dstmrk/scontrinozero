// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountInactivityWarningEmail } from "./account-inactivity-warning";

const PROPS = {
  firstName: "Mario",
  deletionDate: new Date("2026-08-15T00:00:00.000Z"),
  loginUrl: "https://app.test/login",
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
});
