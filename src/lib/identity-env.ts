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

  // `NEXT_PUBLIC_APP_URL`: distinguiamo "non settato" (OK, default
  // applica) da "settato ma vuoto/whitespace" (errore — regola 18) e da
  // "settato e malformato" (errore via TrustedAppUrlError).
  const appUrlRaw = process.env[APP_URL_ENV];
  if (appUrlRaw !== undefined) {
    if (appUrlRaw.trim() === "") {
      errors.push(
        `${APP_URL_ENV} is present but empty — Dockerfile likely bakes ARG without a value (regola 18)`,
      );
    } else {
      try {
        getTrustedAppUrl();
      } catch (err) {
        if (err instanceof TrustedAppUrlError) {
          errors.push(`${APP_URL_ENV}: ${err.message}`);
        } else {
          // Non rilanciamo subito: continuiamo a raccogliere errori
          // sugli altri env per dare un report completo al deploy.
          errors.push(
            `${APP_URL_ENV}: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
      }
    }
  }

  for (const name of HOSTNAME_ENV_VARS) {
    const raw = process.env[name];
    if (raw === undefined) continue; // not set → fallback default applies
    if (raw.trim() === "") {
      errors.push(
        `${name} is present but empty — Dockerfile likely bakes ARG without a value (regola 18)`,
      );
      continue;
    }
    const normalised = raw.trim().toLowerCase();
    if (!isValidHostnameSyntax(normalised)) {
      errors.push(
        `${name}="${raw}" is not a valid hostname (no scheme, no slash, no port)`,
      );
    }
  }

  return errors;
}
