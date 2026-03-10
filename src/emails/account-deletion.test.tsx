// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountDeletionEmail } from "./account-deletion";

describe("AccountDeletionEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(AccountDeletionEmail, { email: "test@example.com" }),
    );
    expect(html).toBeTruthy();
  });

  it("includes the recipient email address", () => {
    const html = renderToStaticMarkup(
      createElement(AccountDeletionEmail, { email: "utente@test.it" }),
    );
    expect(html).toContain("utente@test.it");
  });

  it("includes confirmation of account deletion", () => {
    const html = renderToStaticMarkup(
      createElement(AccountDeletionEmail, { email: "test@example.com" }),
    );
    expect(html).toContain("eliminato");
  });

  it("mentions GDPR data removal", () => {
    const html = renderToStaticMarkup(
      createElement(AccountDeletionEmail, { email: "test@example.com" }),
    );
    expect(html).toContain("GDPR");
  });
});
