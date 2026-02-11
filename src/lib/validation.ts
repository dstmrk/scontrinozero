/**
 * Validates email format using linear-time string checks (no regex backtracking).
 * This is a structural check, not RFC 5322 compliance — real validation
 * happens when the confirmation email is delivered.
 */
export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (email.includes(" ")) return false;

  const atIndex = email.indexOf("@");
  if (atIndex < 1) return false;
  if (email.includes("@", atIndex + 1)) return false;

  const domain = email.slice(atIndex + 1);
  if (domain.length === 0 || !domain.includes(".")) return false;

  return true;
}
