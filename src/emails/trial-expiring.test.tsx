// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialExpiringEmail } from "./trial-expiring";

const PROPS = {
  firstName: "Mario",
  trialExpiresAt: new Date("2026-04-10T12:00:00.000Z"),
  dashboardUrl: "https://scontrinozero.it/dashboard/abbonamento",
};

describe("TrialExpiringEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(createElement(TrialExpiringEmail, PROPS));
    expect(html).toBeTruthy();
  });

  it("includes the recipient first name", () => {
    const html = renderToStaticMarkup(createElement(TrialExpiringEmail, PROPS));
    expect(html).toContain("Mario");
  });

  it("includes the trial expiry date formatted in Italian", () => {
    const html = renderToStaticMarkup(createElement(TrialExpiringEmail, PROPS));
    // Date formatted as "10 aprile 2026" (Italian locale)
    expect(html).toContain("aprile");
    expect(html).toContain("2026");
  });

  it("includes the dashboard CTA link", () => {
    const html = renderToStaticMarkup(createElement(TrialExpiringEmail, PROPS));
    expect(html).toContain("https://scontrinozero.it/dashboard/abbonamento");
  });

  it("includes a call to action to upgrade", () => {
    const html = renderToStaticMarkup(createElement(TrialExpiringEmail, PROPS));
    expect(html.toLowerCase()).toMatch(/abbonamento|piano|upgrade/i);
  });

  it("mentions 7 days or trial expiry in subject/preview", () => {
    const html = renderToStaticMarkup(createElement(TrialExpiringEmail, PROPS));
    expect(html).toMatch(/7 giorni|prova/i);
  });
});
