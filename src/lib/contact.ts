export const CONTACT_EMAIL = "info@scontrinozero.it";
export const VAT_NUMBER = "11836750015";

/** Oggetto pre-compilato dell'email di assistenza. */
const SUPPORT_SUBJECT = "Richiesta assistenza ScontrinoZero";

/** Segnaposto usato quando un campo del contesto non è disponibile. */
const NOT_AVAILABLE = "(non disponibile)";

/**
 * Costruisce l'href `mailto:` verso il supporto, con oggetto e corpo
 * pre-compilati. Il corpo riporta i dati che la pagina
 * `/help/contatto-assistenza` chiede di includere (email account, piano,
 * versione app) più un segnaposto per la descrizione del problema, così
 * l'utente non deve ricopiarli a mano.
 *
 * Tutti i parametri sono codificati con `encodeURIComponent`: un account email
 * o un piano assenti diventano un segnaposto leggibile, mai la stringa
 * `undefined`/`null` nel corpo dell'email.
 */
export function buildSupportMailtoHref({
  accountEmail,
  plan,
  appVersion,
}: {
  readonly accountEmail: string | null | undefined;
  readonly plan: string | null | undefined;
  readonly appVersion: string;
}): string {
  const body = [
    `Email account: ${accountEmail || NOT_AVAILABLE}`,
    `Piano: ${plan || NOT_AVAILABLE}`,
    `Versione: ${appVersion}`,
    "",
    "Descrizione del problema:",
    "",
  ].join("\n");

  const params = new URLSearchParams({ subject: SUPPORT_SUBJECT, body });
  return `mailto:${CONTACT_EMAIL}?${params.toString()}`;
}
