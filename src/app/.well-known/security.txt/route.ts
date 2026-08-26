import { headers } from "next/headers";
import { isIndexableHost, marketingBaseUrl } from "@/lib/seo-indexable";

/**
 * Scadenza dichiarata nel campo `Expires` (RFC 9116 §2.5.5, obbligatorio):
 * oltre questa data il file va considerato stale e chi segnala non deve più
 * fidarsi dei contatti che dichiara.
 *
 * È volutamente una costante pinnata, non un `now + 1 anno` calcolato a
 * runtime: un'expiry che si rinnova da sola non scade mai e riduce il campo a
 * decorazione. Il rinnovo è presidiato da un gate — `route.test.ts` fallisce
 * quando mancano meno di 30 giorni — così la CI diventa rossa in tempo per
 * rivedere contatti e lingue e spostare questa riga di un anno.
 */
export const SECURITY_TXT_EXPIRES = "2027-08-26T00:00:00.000Z";

/** Indirizzo di contatto pubblico, lo stesso di /help e delle pagine legali. */
const CONTACT_EMAIL = "info@scontrinozero.it";

function buildSecurityTxt(baseUrl: string): string {
  return [
    "# Segnalazioni di sicurezza su ScontrinoZero.",
    "# Scrivici prima di divulgare: rispondiamo in italiano o in inglese e",
    "# concordiamo con te i tempi di pubblicazione.",
    "",
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: it, en",
    `Canonical: ${baseUrl}/.well-known/security.txt`,
    "",
  ].join("\n");
}

/**
 * `/.well-known/security.txt` (RFC 9116): canale dichiarato per le
 * segnalazioni di vulnerabilità.
 *
 * Come robots.ts e llms.txt è servito solo sull'apex marketing indicizzabile e
 * risponde 404 altrove — su un'istanza self-hosted pubblicare i nostri contatti
 * sarebbe sbagliato, le sue vulnerabilità operative le gestisce chi la ospita.
 * Sul dominio app il file non manca comunque: `/.well-known` è in
 * `MARKETING_ONLY_ROUTES` (src/proxy.ts), quindi la richiesta viene rimbalzata
 * sull'apex, che è anche l'URL dichiarato in `Canonical`.
 */
export async function GET(): Promise<Response> {
  const host = (await headers()).get("host");

  if (!isIndexableHost(host)) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(buildSecurityTxt(marketingBaseUrl()), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
