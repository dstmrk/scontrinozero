// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountInactivityDeletionEmail } from "./account-inactivity-deletion";

describe("AccountInactivityDeletionEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
      }),
    );
    expect(html).toBeTruthy();
  });

  it("include l'indirizzo email destinatario", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "utente@test.it",
      }),
    );
    expect(html).toContain("utente@test.it");
  });

  it("esplicita il motivo dell'inattività", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
      }),
    );
    expect(html).toContain("inattività");
  });

  it("menziona il portale AdE per i documenti commerciali", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
      }),
    );
    expect(html).toContain("Fatture e Corrispettivi");
  });
});
