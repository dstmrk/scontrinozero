// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmSignupEmail } from "./confirm-signup";

const confirmLink =
  "https://ref.supabase.co/auth/v1/verify?token=abc&type=signup&redirect_to=https%3A%2F%2Fapp.scontrinozero.it%2Fcallback";

describe("ConfirmSignupEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmSignupEmail, { confirmLink }),
    );

    expect(html).toBeTruthy();
  });

  it("includes the confirmation link in the button", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmSignupEmail, { confirmLink }),
    );

    expect(html).toContain(`href="${confirmLink.replaceAll("&", "&amp;")}"`);
  });

  it("shows the link in clear text too, for clients that degrade the HTML", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmSignupEmail, { confirmLink }),
    );

    // Il testo visibile, non solo l'href: è ciò che un utente può copiare.
    expect(html).toContain(`>${confirmLink.replaceAll("&", "&amp;")}<`);
  });

  it("tells the recipient what to do if the signup is not theirs", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmSignupEmail, { confirmLink }),
    );

    expect(html).toContain("ignora questa email");
  });
});
