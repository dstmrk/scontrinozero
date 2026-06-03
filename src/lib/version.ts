import pkg from "../../package.json";

/** Versione semantica dell'app (= tag git), fonte unica in package.json. */
export const APP_VERSION = pkg.version;

/** SHA breve del commit buildato; "dev" se non iniettato (locale/self-host). */
export function getBuildSha(): string {
  const sha = process.env.BUILD_SHA;
  return sha ? sha.slice(0, 7) : "dev";
}

/**
 * Etichetta build mostrata nella card "Informazioni" delle impostazioni.
 * Prod: solo lo SHA breve (es. "a1b2c3d"). Ambiente dev (immagine `:dev`,
 * `BUILD_CHANNEL=dev` iniettato da deploy-dev.yml): SHA prefissato da "dev"
 * (es. "dev a1b2c3d"), così resta distinguibile da prod a colpo d'occhio.
 * Locale/self-host (nessuno SHA): "dev".
 */
export function getBuildLabel(): string {
  const sha = getBuildSha();
  if (process.env.BUILD_CHANNEL === "dev") {
    return sha === "dev" ? "dev" : `dev ${sha}`;
  }
  return sha;
}

/**
 * Identificatore release nel formato Sentry `name@version+build`. Usato come
 * `release` in Sentry.init (tagga Issue e Sentry Logs col codice in esecuzione)
 * e come campo `release` nei log pino. Lo SHA breve fa da build metadata quando
 * iniettato (`BUILD_SHA`); senza SHA (locale/self-host) resta la sola versione
 * semantica. Letto a runtime: `BUILD_SHA` e' bakato nello stage di produzione.
 */
export function getAppRelease(): string {
  const sha = getBuildSha();
  return sha === "dev"
    ? `scontrinozero@${APP_VERSION}`
    : `scontrinozero@${APP_VERSION}+${sha}`;
}
