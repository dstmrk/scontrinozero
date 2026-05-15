/**
 * Validates the `?ref=` query string captured at signup time against an
 * explicit allowlist. The result is persisted to `profiles.signup_source`
 * for attribution analytics on soft-launch channels.
 *
 * Rules:
 * - Trim + lowercase before matching.
 * - Reject non-string, empty, >64 chars, or non `[a-z0-9_-]` input.
 * - Return null for anything not in ALLOWED_SIGNUP_SOURCES — silently dropping
 *   garbage protects the column from PII / injection / spam attribution.
 */
export const ALLOWED_SIGNUP_SOURCES = [
  "reddit",
  "indiehackers",
  "linkedin",
  "hn",
  "twitter",
  "fb",
  "direct",
  "producthunt",
] as const;

export type SignupSource = (typeof ALLOWED_SIGNUP_SOURCES)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_SIGNUP_SOURCES);
const VALID_CHARS = /^[a-z0-9_-]{1,64}$/;

export function normalizeSignupSource(
  raw: string | null | undefined,
): SignupSource | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.trim().toLowerCase();
  if (!VALID_CHARS.test(normalised)) return null;
  return ALLOWED_SET.has(normalised) ? (normalised as SignupSource) : null;
}
