// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeEmail } from "./welcome";

describe("WelcomeEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomeEmail, { email: "test@example.com" }),
    );
    expect(html).toBeTruthy();
  });

  it("includes the recipient email address", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomeEmail, { email: "utente@test.it" }),
    );
    expect(html).toContain("utente@test.it");
  });

  it("includes the dashboard CTA link", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomeEmail, { email: "test@example.com" }),
    );
    expect(html).toContain("/dashboard");
  });
});
