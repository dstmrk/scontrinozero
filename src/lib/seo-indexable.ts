import { parseTrustedHostnameEnv } from "./hostname-env";

/**
 * Decide se un hostname è il dominio di produzione che deve essere indicizzato
 * dai motori di ricerca.
 *
 * Solo l'apex marketing di produzione (`scontrinozero.it` + `www.`) è
 * indicizzabile. Tutto il resto — dominio app (`app.scontrinozero.it`, che
 * serve solo aree private e pagine auth), ambiente sandbox
 * (`sandbox.scontrinozero.it`) e istanze self-hosted su domini custom — deve
 * restare fuori dall'indice per evitare contenuti duplicati che competono con
 * il sito ufficiale.
 *
 * **Perché `NEXT_PUBLIC_MARKETING_HOSTNAME` e non l'override runtime
 * `APP_HOSTNAME`:** sandbox e self-host condividono la stessa immagine Docker
 * di produzione (i `NEXT_PUBLIC_*` sono baked una volta sola al build) e si
 * differenziano *solo* tramite il runtime `APP_HOSTNAME`. Affidarsi al valore
 * baked garantisce quindi che l'apex indicizzabile resti `scontrinozero.it`
 * ovunque, e che gli host sandbox/self-host (che NON coincidono con esso)
 * cadano correttamente in noindex.
 */
export function isIndexableHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/:\d+$/, "");
  const marketing = parseTrustedHostnameEnv(
    "NEXT_PUBLIC_MARKETING_HOSTNAME",
    "scontrinozero.it",
  );
  return host === marketing || host === `www.${marketing}`;
}
