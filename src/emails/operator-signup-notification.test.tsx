// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorSignupNotificationEmail } from "./operator-signup-notification";

describe("OperatorSignupNotificationEmail", () => {
  it("renders first name, last name and email", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSignupNotificationEmail, {
        firstName: "Mario",
        lastName: "Rossi",
        email: "mario@example.it",
      }),
    );
    expect(html).toContain("Mario Rossi");
    expect(html).toContain("mario@example.it");
  });

  it("falls back to placeholder when name is empty", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorSignupNotificationEmail, {
        firstName: "",
        lastName: "",
        email: "test@example.it",
      }),
    );
    expect(html).toContain("(non fornito)");
    expect(html).toContain("test@example.it");
  });
});
