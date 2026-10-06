// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountInactivityDeletionEmail } from "./account-inactivity-deletion";

const LAST_ACTIVITY = new Date("2025-07-07T10:00:00.000Z");

describe("AccountInactivityDeletionEmail", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
        lastActivityAt: LAST_ACTIVITY,
      }),
    );
    expect(html).toBeTruthy();
  });

  it("include l'indirizzo email destinatario", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "utente@test.it",
        lastActivityAt: LAST_ACTIVITY,
      }),
    );
    expect(html).toContain("utente@test.it");
  });

  it("esplicita il motivo dell'inattività", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
        lastActivityAt: LAST_ACTIVITY,
      }),
    );
    expect(html).toContain("inattività");
  });

  it("menziona il portale AdE per i documenti commerciali", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
        lastActivityAt: LAST_ACTIVITY,
      }),
    );
    expect(html).toContain("Fatture e Corrispettivi");
  });

  it("indica la data dell'ultima attività invece di una durata fissa", () => {
    const html = renderToStaticMarkup(
      createElement(AccountInactivityDeletionEmail, {
        email: "test@example.com",
        lastActivityAt: LAST_ACTIVITY,
      }),
    );
    expect(html).toContain("7 luglio 2025");
    expect(html).not.toContain("12 mesi");
  });
});
