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
