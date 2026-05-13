/**
 * PostgreSQL error helpers.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */

export function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "23505"
  );
}
