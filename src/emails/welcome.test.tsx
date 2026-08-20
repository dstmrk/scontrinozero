// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeEmail } from "./welcome";

describe("WelcomeEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  // REVIEW.md #93 — l'immagine è una sola per prod e sandbox, quindi
  // `NEXT_PUBLIC_APP_URL` è bakata col valore di produzione anche nel
  // container sandbox: il CTA deve seguire l'override runtime `APP_HOSTNAME`,
  // altrimenti la mail di benvenuto di sandbox porta l'utente su produzione.
  it("points the CTA at the runtime APP_HOSTNAME, not the baked URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it");
    vi.stubEnv("APP_HOSTNAME", "sandbox.scontrinozero.it");
    const html = renderToStaticMarkup(
      createElement(WelcomeEmail, { email: "test@example.com" }),
    );
    expect(html).toContain("https://sandbox.scontrinozero.it/dashboard");
  });

  // La dashboard vive sul subdomain app: il vecchio fallback puntava
  // all'apex marketing, dove `/dashboard` non esiste.
  it("points the CTA at the app subdomain when no env is set in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const html = renderToStaticMarkup(
      createElement(WelcomeEmail, { email: "test@example.com" }),
    );
    expect(html).toContain("https://app.scontrinozero.it/dashboard");
  });
});
