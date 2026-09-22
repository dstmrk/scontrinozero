/**
 * Host dell'app web che il guscio carica via `server.url` (docs/mobile-v2.md
 * punto 4): niente asset impacchettati, un deploy aggiorna web e mobile
 * insieme. La scelta avviene al `cap sync`, che scrive la config risolta nei
 * progetti nativi: da lì in poi il build è legato a quell'ambiente.
 */
export const SERVER_URLS = {
  prod: "https://app.scontrinozero.it",
  sandbox: "https://sandbox.scontrinozero.it",
  dev: "https://app-dev.scontrinozero.it",
} as const;

export type MobileTarget = keyof typeof SERVER_URLS;

/**
 * Nessun default: un build da store che punta a dev, o un build di prova che
 * emette scontrini veri su prod, costano più di un sync fallito.
 */
export function resolveServerUrl(target: string | undefined): string {
  const valid = Object.keys(SERVER_URLS).join(", ");
  if (!target || !Object.hasOwn(SERVER_URLS, target)) {
    const got = target ? `"${target}"` : "assente";
    throw new Error(`MOBILE_TARGET ${got}: valori ammessi ${valid}`);
  }
  return SERVER_URLS[target as MobileTarget];
}
