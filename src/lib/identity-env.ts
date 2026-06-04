import { logger } from "@/lib/logger";
import { isValidHostnameSyntax } from "./hostname-env";
import { getTrustedAppUrl, TrustedAppUrlError } from "./trusted-app-url";

/**
 * Hostname env vars validati al boot. La lista è duplicata in
 * `next.config.ts` e `src/lib/trusted-app-url.ts` ma là viene letta in
 * modo lazy con fallback silenzioso — qui invece la verifichiamo
 * **strict** all'avvio del container.
 *
 * Le NEXT_PUBLIC_* sono baked al build (`Dockerfile` ARG/ENV) ma vengono
 * lette anche a runtime per chi punta sandbox/self-hosted, quindi
 * compaiono qui — un valore baked sbagliato si scopriva oggi solo al
 * primo URL costruito (SCONTRINOZERO-F).
 */
const HOSTNAME_ENV_VARS = [
  "APP_HOSTNAME",
  "NEXT_PUBLIC_APP_HOSTNAME",
  "MARKETING_HOSTNAME",
  "NEXT_PUBLIC_MARKETING_HOSTNAME",
  "API_HOSTNAME",
  "NEXT_PUBLIC_API_HOSTNAME",
] as const;

const APP_URL_ENV = "NEXT_PUBLIC_APP_URL" as const;

/**
 * Valida le env d'identità al boot del container.
 *
 * Le env coperte (`NEXT_PUBLIC_APP_URL`, `APP_HOSTNAME`,
 * `NEXT_PUBLIC_APP_HOSTNAME`, `MARKETING_HOSTNAME`,
 * `NEXT_PUBLIC_MARKETING_HOSTNAME`, `API_HOSTNAME`,
 * `NEXT_PUBLIC_API_HOSTNAME`) sono quelle che producono URL/redirect:
 * Stripe checkout, reset-password, magic-link, marketing → app SSO.
 *
 * Behaviour:
 * - `NODE_ENV === "production"` → throw aggregato → il container non
 *   parte. Defense in depth contro la regola 18 (present-but-empty,
 *   `?? default` che non scatta) e contro SCONTRINOZERO-D/F (URL
 *   malformato scoperto solo al primo route hit).
 * - dev/test → `logger.warn` strutturato, il processo continua. Non
 *   blocchiamo il dev loop quando un'env locale è temporaneamente
 *   incongruente.
 *
 * Le guardie lazy esistenti (`getTrustedAppUrl()`,
 * `parseTrustedHostnameEnv()` con fallback) restano in piedi — sono il
 * secondo strato, non vengono toccate.
 */
export function assertIdentityEnv(): void {
  const errors = collectIdentityEnvErrors();
  if (errors.length === 0) return;

  const isProd = process.env.NODE_ENV === "production";
  const payload = {
    critical: true,
    errorClass: "identity_env_invalid",
    errors,
  };
  const message =
    "identity env validation failed at boot — refusing to build redirect URLs";

  if (isProd) {
    logger.error(payload, message);
    throw new Error(`${message}\n - ${errors.join("\n - ")}`);
  }
  logger.warn(payload, message);
}

function collectIdentityEnvErrors(): string[] {
  const errors: string[] = [];

  const appUrlError = validateAppUrlEnv();
  if (appUrlError) errors.push(appUrlError);

  for (const name of HOSTNAME_ENV_VARS) {
    const hostnameError = validateHostnameEnvVar(name);
    if (hostnameError) errors.push(hostnameError);
  }

  return errors;
}

/**
 * Valida `NEXT_PUBLIC_APP_URL`. Distinguiamo "non settato" (OK, default
 * applica), "settato ma vuoto/whitespace" (errore — regola 18), e
 * "settato e malformato" (errore via `TrustedAppUrlError`).
 */
function validateAppUrlEnv(): string | null {
  const raw = process.env[APP_URL_ENV];
  if (raw === undefined) return null;
  if (raw.trim() === "") {
    return `${APP_URL_ENV} is present but empty — Dockerfile likely bakes ARG without a value (regola 18)`;
  }
  try {
    getTrustedAppUrl();
    return null;
  } catch (err) {
    // Non rilanciamo subito: il chiamante accumula errori sugli altri
    // env per dare un report completo al deploy.
    if (err instanceof TrustedAppUrlError) {
      return `${APP_URL_ENV}: ${err.message}`;
    }
    return `${APP_URL_ENV}: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

function validateHostnameEnvVar(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return null; // fallback default applies
  if (raw.trim() === "") {
    return `${name} is present but empty — Dockerfile likely bakes ARG without a value (regola 18)`;
  }
  const normalised = raw.trim().toLowerCase();
  if (!isValidHostnameSyntax(normalised)) {
    return `${name}="${raw}" is not a valid hostname (no scheme, no slash, no port)`;
  }
  return null;
}
