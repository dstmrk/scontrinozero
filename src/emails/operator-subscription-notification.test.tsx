// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorSubscriptionNotificationEmail } from "./operator-subscription-notification";

const base = {
  firstName: "Mario",
  lastName: "Rossi",
  email: "mario@example.it",
  title: "Nuovo abbonamento",
  planLabel: "Pro annuale",
};

describe("OperatorSubscriptionNotificationEmail", () => {
  it("renders name, email, event title and plan", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSubscriptionNotificationEmail, base),
    );
    expect(html).toContain("Mario Rossi");
    expect(html).toContain("mario@example.it");
    expect(html).toContain("Nuovo abbonamento");
    expect(html).toContain("Pro annuale");
  });

  it("omits previous plan and end date when not provided", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSubscriptionNotificationEmail, base),
    );
    expect(html).not.toContain("Piano precedente");
    expect(html).not.toContain("Attivo fino al");
  });

  it("shows previous plan on a plan change", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSubscriptionNotificationEmail, {
        ...base,
        previousPlanLabel: "Starter mensile",
      }),
    );
    expect(html).toContain("Piano precedente");
    expect(html).toContain("Starter mensile");
  });

  it("shows the end date on a scheduled cancellation", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSubscriptionNotificationEmail, {
        ...base,
        endsAtLabel: "7 luglio 2026",
      }),
    );
    expect(html).toContain("Attivo fino al");
    expect(html).toContain("7 luglio 2026");
  });

  it("falls back to placeholder when name is empty", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSubscriptionNotificationEmail, {
        ...base,
        firstName: "",
        lastName: "",
      }),
    );
    expect(html).toContain("(non fornito)");
  });
});
