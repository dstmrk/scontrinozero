// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordResetEmail } from "./password-reset";

describe("PasswordResetEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordResetEmail, {
        resetLink: "https://scontrinozero.it/reset?token=abc",
      }),
    );
    expect(html).toBeTruthy();
  });

  it("includes the reset link", () => {
    const resetLink = "https://scontrinozero.it/reset?token=xyz123";
    const html = renderToStaticMarkup(
      createElement(PasswordResetEmail, { resetLink }),
    );
    expect(html).toContain(resetLink);
  });

  it("includes the 1-hour expiry warning", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordResetEmail, {
        resetLink: "https://scontrinozero.it/reset?token=abc",
      }),
    );
    expect(html).toContain("1 ora");
  });
});
