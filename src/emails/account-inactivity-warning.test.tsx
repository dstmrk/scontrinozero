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

  it("saluta l'utente col nome quando presente", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, PROPS),
    );
    expect(html).toContain("Mario");
  });

  it("non stampa un saluto rotto quando firstName è vuoto", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, { ...PROPS, firstName: "" }),
    );
    expect(html).toContain("Ciao,");
  });

  it("mostra la data di cancellazione in italiano", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, PROPS),
    );
    expect(html).toContain("15 agosto 2026");
  });

  it("include il link di login per mantenere l'account", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityWarningEmail, PROPS),
    );
    expect(html).toContain("https://app.test/login");
  });
});
