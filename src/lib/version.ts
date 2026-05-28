import pkg from "../../package.json";

/** Versione semantica dell'app (= tag git), fonte unica in package.json. */
export const APP_VERSION = pkg.version;

/** SHA breve del commit buildato; "dev" se non iniettato (locale/self-host). */
export function getBuildSha(): string {
  const sha = process.env.BUILD_SHA;
  return sha ? sha.slice(0, 7) : "dev";
}
