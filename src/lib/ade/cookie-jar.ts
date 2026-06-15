/**
 * Lightweight cookie jar for managing HTTP cookies across fetch requests.
 *
 * Designed for the AdE portal integration where all requests target a single
 * origin (ivaservizi.agenziaentrate.gov.it). No path/domain matching needed.
 *
 * Security: toString() never exposes cookie values.
 */

export class CookieJar {
  private readonly cookies: Map<string, string> = new Map();

  /** Parse Set-Cookie headers from a fetch Response and store them. */
  applyResponse(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie();

    for (const header of setCookieHeaders) {
      const segments = header.split(";");

      // First segment is name=value; the rest are attributes.
      const cookiePart = segments[0].trim();
      if (!cookiePart) continue;

      // Split on first "=" only to handle values containing "="
      const eqIndex = cookiePart.indexOf("=");
      if (eqIndex === -1) continue;

      const name = cookiePart.slice(0, eqIndex).trim();
      const value = cookiePart.slice(eqIndex + 1);
      if (!name) continue;

      // Honor deletion/expiry semantics: a long-lived jar (session reuse) must
      // not keep cookies the server has expired or cleared. Without this it
      // would store NAME="" and keep sending the deleted cookie.
      if (CookieJar.isDeletionSignal(value, segments.slice(1))) {
        this.cookies.delete(name);
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  /**
   * Decide whether a Set-Cookie clears the cookie rather than storing it.
   *
   * Precedence per RFC 6265: Max-Age wins over Expires. A cookie is deleted on
   * a non-positive Max-Age, an Expires in the past, or an empty value with no
   * attribute that keeps it alive. Malformed attributes are ignored (no false
   * delete). Path/Domain/HttpOnly/Secure/SameSite are not relevant (single
   * origin) and are skipped without crashing.
   */
  private static isDeletionSignal(
    value: string,
    attributes: string[],
  ): boolean {
    let maxAge: number | undefined;
    let expiresAt: number | undefined;

    for (const attr of attributes) {
      const eq = attr.indexOf("=");
      if (eq === -1) continue;
      const key = attr.slice(0, eq).trim().toLowerCase();
      const raw = attr.slice(eq + 1).trim();

      if (key === "max-age" && /^-?\d+$/.test(raw)) {
        maxAge = Number(raw);
      } else if (key === "expires") {
        const t = Date.parse(raw);
        if (!Number.isNaN(t)) expiresAt = t;
      }
    }

    if (maxAge !== undefined) return maxAge <= 0;
    if (expiresAt !== undefined) return expiresAt <= Date.now();
    return value === "";
  }

  /** Return the Cookie header value for the next request. */
  toHeaderValue(): string {
    const parts: string[] = [];
    for (const [name, value] of this.cookies) {
      parts.push(`${name}=${value}`);
    }
    return parts.join("; ");
  }

  /** Clear all cookies. */
  clear(): void {
    this.cookies.clear();
  }

  /** Number of stored cookies. */
  get size(): number {
    return this.cookies.size;
  }

  /** Has a specific cookie name. */
  has(name: string): boolean {
    return this.cookies.has(name);
  }

  /** Redacted summary — never exposes cookie values. */
  toString(): string {
    return `CookieJar(${this.cookies.size} cookies)`;
  }
}
