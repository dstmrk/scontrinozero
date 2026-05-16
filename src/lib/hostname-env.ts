import { logger } from "@/lib/logger";

/**
 * Parses and validates a hostname read from an environment variable.
 *
 * Rules:
 * - trim + lowercase
 * - reject empty strings
 * - reject scheme prefixes (`http://`, `https://`)
 * - reject any character that cannot legally appear in a hostname
 *   (slash, query, spaces, port separator, …)
 * - normalise a trailing dot (FQDN form) to its bare form
 *
 * Behaviour on invalid input:
 * - `production`: fail-closed — the helper falls back to the provided default and
 *   logs `critical: true` so the misconfiguration surfaces in Sentry. A malformed
 *   trusted hostname must NEVER alter routing decisions silently.
 * - `dev`/`test`: same fallback but only a `warn`. The dev workflow stays usable.
 *
 * Always returns a normalised, syntactically-valid hostname (either the parsed
 * env value or the fallback) so callers can plug it into Set/comparison without
 * extra guards.
 */
export function parseTrustedHostnameEnv(
  name: string,
  fallback: string,
): string {
  const raw = process.env[name];
  if (raw === undefined) return normaliseOrThrow(fallback, name);

  const trimmed = raw.trim().toLowerCase();
  if (!isValidHostnameSyntax(trimmed)) {
    const isProduction = process.env.NODE_ENV === "production";
    const fallbackNormalised = normaliseOrThrow(fallback, name);
    if (isProduction) {
      logger.error(
        {
          critical: true,
          envVar: name,
          fallbackHost: fallbackNormalised,
        },
        "Malformed trusted hostname env var — falling back to default",
      );
    } else {
      logger.warn(
        { envVar: name, fallbackHost: fallbackNormalised },
        "Malformed trusted hostname env var — falling back to default",
      );
    }
    return fallbackNormalised;
  }

  return stripTrailingDot(trimmed);
}

/**
 * Strict hostname syntax check.
 *
 * Allowed: letters, digits, hyphen, dot. Must not be empty, must not contain
 * scheme/path/query/port markers. Length must fit within the DNS limit (253).
 */
function isValidHostnameSyntax(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  if (value.includes("://")) return false;
  if (value.includes("/")) return false;
  if (value.includes("?")) return false;
  if (value.includes("#")) return false;
  if (value.includes(":")) return false;
  if (value.includes(" ")) return false;
  if (value.startsWith(".") || value.startsWith("-")) return false;

  // Each label: 1..63 chars, [a-z0-9-], no leading/trailing hyphen.
  // Strip a single trailing dot for the per-label check (root FQDN form).
  const bare = stripTrailingDot(value);
  if (bare.length === 0) return false;
  const labels = bare.split(".");
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
  }
  return true;
}

function stripTrailingDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

/**
 * Validates the fallback at module-evaluation time. If a developer ships a
 * broken default we want to know loudly, not silently fall back to "".
 */
function normaliseOrThrow(fallback: string, ctx: string): string {
  const normalised = stripTrailingDot(fallback.trim().toLowerCase());
  if (!isValidHostnameSyntax(normalised)) {
    throw new Error(
      `parseTrustedHostnameEnv(${ctx}): fallback "${fallback}" is not a valid hostname`,
    );
  }
  return normalised;
}
