import { describe, it, expect } from "vitest";
import { describeCieIdpPage } from "./cie-idp-page";

// KO livello2 reale (login_cie_ko_credenziali_non_valide.har), con l'email
// già compilata nel value dell'input come fa l'IdP al re-render.
const KO_PAGE = `<!DOCTYPE html><html><head><title>CIE Login</title></head>
  <body><form action="/idp/login/livello2" method="post">
  <div class="row mb-4 mx-n2 error"> Credenziali non valide.</div>
  <input name="username" value="mario.rossi@example.com" class="form-control error" />
  <input name="password" type="password" class="form-control input-password error " />
  </form></body></html>`;

describe("describeCieIdpPage", () => {
  it("extracts the IdP message and the title from the known KO page", () => {
    expect(describeCieIdpPage(KO_PAGE)).toEqual({
      idpMessage: "Credenziali non valide.",
      pageTitle: "CIE Login",
    });
  });

  it("never leaks attribute values (the email prefilled in the input)", () => {
    const { idpMessage, pageTitle } = describeCieIdpPage(KO_PAGE);
    expect(`${idpMessage} ${pageTitle}`).not.toContain("mario.rossi");
  });

  it("redacts emails and codici fiscali that appear in visible text", () => {
    const html = `<div class="alert alert-danger">Utenza mario.rossi@example.com
      (RSSMRA80A01H501U) temporaneamente bloccata</div>`;
    expect(describeCieIdpPage(html).idpMessage).toBe(
      "Utenza [email] ([cf]) temporaneamente bloccata",
    );
  });

  it("reads text nested inside the error element", () => {
    const html = `<div class="alert-danger"><p><strong>Attenzione:</strong> richiesta già in corso</p></div>`;
    expect(describeCieIdpPage(html).idpMessage).toBe(
      "Attenzione: richiesta già in corso",
    );
  });

  it("joins distinct messages, drops duplicates, keeps at most three", () => {
    const html = `
      <div class="alert"><span class="error">Uno</span></div>
      <span class="error">Due</span>
      <p class="invalid-feedback">Tre</p>
      <p class="errore">Quattro</p>`;
    expect(describeCieIdpPage(html).idpMessage).toBe("Uno | Due | Tre");
  });

  it("accepts single-quoted class attributes and ignores case", () => {
    const html = `<DIV CLASS='Error'>Sessione scaduta</DIV>`;
    expect(describeCieIdpPage(html).idpMessage).toBe("Sessione scaduta");
  });

  it("does not match classes that merely contain the word", () => {
    const html = `<div class="error-page-wrapper">layout</div><div class="noerror">x</div>`;
    expect(describeCieIdpPage(html).idpMessage).toBeNull();
  });

  it("returns nulls when the page has no error element and no title", () => {
    expect(describeCieIdpPage("")).toEqual({
      idpMessage: null,
      pageTitle: null,
    });
    expect(describeCieIdpPage("<div>ok</div>").idpMessage).toBeNull();
  });

  it("skips error elements with no visible text", () => {
    const html = `<div class="error">   </div><title>  </title>`;
    expect(describeCieIdpPage(html)).toEqual({
      idpMessage: null,
      pageTitle: null,
    });
  });

  it("caps long messages at 200 characters", () => {
    const html = `<div class="error">${"a".repeat(500)}</div>`;
    const { idpMessage } = describeCieIdpPage(html);
    expect(idpMessage).toHaveLength(200);
    expect(idpMessage?.endsWith("…")).toBe(true);
  });

  it("bounds the snippet when the error element is never closed", () => {
    const html = `<div class="error">Messaggio${" x".repeat(2000)}`;
    expect(describeCieIdpPage(html).idpMessage).toMatch(/^Messaggio x/);
  });

  it("redacts before truncating, so a cut never exposes half an email", () => {
    const html = `<div class="error">${"a ".repeat(95)}mario.rossi@example.com</div>`;
    expect(describeCieIdpPage(html).idpMessage).not.toContain("mario");
  });
});
