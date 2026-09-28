/**
 * Diagnostica della pagina che l'IdP CIE rende dopo il POST livello2, quando
 * `ciePostCredentials` la classifica come credenziali rifiutate.
 *
 * Perché esiste: il 28/09/2026 le stesse credenziali salvate sono passate a
 * livello2 alle 11:31 e sono state "rifiutate" alle 11:43, senza salvataggi in
 * mezzo. O l'IdP rende un errore diverso dopo una push scaduta, o il nostro
 * marker CSS (`form-control … error`) scatta su una pagina che non dice
 * "Credenziali non valide". Col solo `bodyLen` nel log i due casi erano
 * indistinguibili: qui si estrae il testo che l'utente avrebbe letto.
 *
 * Mai l'HTML grezzo: al re-render l'IdP ricompila l'email nel `value`
 * dell'input. Si tengono solo i nodi di testo (gli attributi spariscono con i
 * tag), con email e codici fiscali oscurati, troncati.
 */

export interface CieIdpPageDescription {
  /** Testo degli elementi d'errore visibili, " | " fra messaggi distinti. */
  idpMessage: string | null;
  pageTitle: string | null;
}

const MAX_TEXT_LEN = 200;
const MAX_MESSAGES = 3;
/** Tetto al frammento letto dopo il tag d'apertura, se la chiusura manca. */
const SNIPPET_WINDOW = 1000;

const VOID_TAGS = new Set(["input", "img", "br", "hr", "meta", "link"]);
const ERROR_CLASS_TOKEN =
  /^(?:error|errore|alert(?:-[a-z]+)?|invalid-feedback)$/;

const OPEN_TAG = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
const CLASS_ATTR = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const TITLE = /<title\b[^>]*>([^<]*)<\/title>/i;
const CODICE_FISCALE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi;

function hasErrorClass(attributes: string): boolean {
  const match = CLASS_ATTR.exec(attributes);
  const classes = match?.[1] ?? match?.[2];
  if (!classes) return false;
  return classes
    .split(/\s+/)
    .some((token) => ERROR_CLASS_TOKEN.test(token.toLowerCase()));
}

/** Scansione lineare, non regex: `<[^>]*>` backtracka su "<<<…" (S8786). */
function toText(fragment: string): string {
  let text = "";
  let inTag = false;
  for (const ch of fragment) {
    if (ch === "<") {
      inTag = true;
      text += " ";
    } else if (ch === ">") {
      inTag = false;
    } else if (!inTag) {
      text += ch;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Oscura prima di troncare: un taglio non deve lasciare mezza email. Ogni
 * parola con una `@` è trattata da email: più largo di una regex, e lineare.
 */
function sanitize(text: string): string | null {
  const redacted = text
    .split(" ")
    .map((word) => (word.includes("@") ? "[email]" : word))
    .join(" ")
    .replace(CODICE_FISCALE, "[cf]");
  if (!redacted) return null;
  return redacted.length > MAX_TEXT_LEN
    ? `${redacted.slice(0, MAX_TEXT_LEN - 1)}…`
    : redacted;
}

function errorMessages(html: string): string[] {
  const lower = html.toLowerCase();
  const messages: string[] = [];
  for (const match of html.matchAll(OPEN_TAG)) {
    const tag = match[1].toLowerCase();
    if (VOID_TAGS.has(tag) || !hasErrorClass(match[2])) continue;

    const start = match.index + match[0].length;
    const close = lower.indexOf(`</${tag}`, start);
    const end =
      close === -1
        ? start + SNIPPET_WINDOW
        : Math.min(close, start + SNIPPET_WINDOW);
    const text = toText(html.slice(start, end));
    if (text && !messages.includes(text)) messages.push(text);
    if (messages.length === MAX_MESSAGES) break;
  }
  return messages;
}

export function describeCieIdpPage(html: string): CieIdpPageDescription {
  const title = TITLE.exec(html)?.[1];
  return {
    idpMessage: sanitize(errorMessages(html).join(" | ")),
    pageTitle: title === undefined ? null : sanitize(toText(title)),
  };
}
