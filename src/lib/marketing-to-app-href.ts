const HARDCODED_DEFAULT = "https://app.scontrinozero.it";

/**
 * Hostname accettati come destinazione del link cross-origin.
 * Coerente con l'allowlist di `getTrustedAppUrl` (`src/lib/trusted-app-url.ts`)
 * ma duplicata qui per evitare di importare il logger (pino) e quindi
 * permettere l'uso anche dai client component (es. pricing-section).
 */
function allowedHostnames(): Set<string> {
  const set = new Set<string>();
  // APP_HOSTNAME è runtime e NON visibile al bundle client: in pratica
  // questa entry rileva solo nei server component. Va bene: lato client
  // ricade su NEXT_PUBLIC_APP_HOSTNAME, che è bakato al build.
  const fromEnv =
    process.env.APP_HOSTNAME ?? process.env.NEXT_PUBLIC_APP_HOSTNAME;
  if (fromEnv) set.add(fromEnv);
  set.add("app.scontrinozero.it");
  if (process.env.NODE_ENV !== "production") {
    set.add("localhost");
    set.add("127.0.0.1");
  }
  return set;
}

function resolveBaseUrl(): string {
  // Priority 1: APP_HOSTNAME runtime override (server-only). Honours the
  // documented "single image, per-env runtime override" pattern: a Docker
  // image built with the production NEXT_PUBLIC_APP_URL but deployed in
  // sandbox/self-hosted must emit links to the runtime hostname, not the
  // baked one.
  const runtimeHost = process.env.APP_HOSTNAME;
  if (runtimeHost) {
    // Validate hostname-only: a typo nel `.env` come
    // `APP_HOSTNAME=https://app.scontrinozero.it` produrrebbe l'URL
    // malformato `https://https://app.scontrinozero.it/login`; un
    // `APP_HOSTNAME=app.scontrinozero.it/redirect` produrrebbe link
    // verso un path arbitrario. Ricadiamo sul default invece di emettere
    // un href rotto. Niente check contro `allowedHostnames()`: la
    // allowlist auto-include `APP_HOSTNAME` (riga 14-16) quindi sarebbe
    // tautologica — la vera difesa contro la compromessione dell'env è
    // fuori dal nostro perimetro (chi controlla l'env controlla anche la
    // sua allowlist).
    if (runtimeHost.includes("://") || runtimeHost.includes("/")) {
      return HARDCODED_DEFAULT;
    }
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    return `${protocol}://${runtimeHost}`;
  }

  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return HARDCODED_DEFAULT;
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    return HARDCODED_DEFAULT;
  }
  if (!allowedHostnames().has(parsed.hostname)) {
    return HARDCODED_DEFAULT;
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/**
 * Costruisce l'URL assoluto verso il subdomain app a partire da un path.
 *
 * Usato dalle pagine/componenti del gruppo `(marketing)/*` per forzare una
 * navigazione cross-origin "hard" quando l'utente clicca un link auth
 * (`/login`, `/register`, `/reset-password`). I `<Link>` di Next.js farebbero
 * client-side soft navigation restando sull'origin `scontrinozero.it`,
 * causando il rendering di `/login` sul dominio marketing — caso che ha già
 * generato il bug `captcha_hostname_mismatch` su Turnstile (commit ac59efc).
 *
 * Non lancia mai: se l'env è malformato o l'hostname è fuori allowlist,
 * ricade su `https://app.scontrinozero.it` per non rompere il render delle
 * pagine marketing pubbliche.
 *
 * **Server-only in pratica**: deve essere chiamata da server component / SSR.
 * Dai client component (post-hydration) `APP_HOSTNAME` e
 * `NEXT_PUBLIC_APP_URL` non sono nel bundle (non sono baked dal Dockerfile
 * corrente) e la funzione cadrebbe sul default hardcoded di produzione,
 * causando un mismatch in sandbox/self-hosted. Da un client component,
 * calcolare l'href in un parent server component e passarlo come prop.
 */
export function appHref(path: `/${string}`): string {
  return `${resolveBaseUrl()}${path}`;
}
