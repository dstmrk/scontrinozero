/**
 * Lightweight cookie jar for managing HTTP cookies across fetch requests.
 *
 * Designed for the AdE portal integration where all requests target a single
 * origin (ivaservizi.agenziaentrate.gov.it). No path/domain matching needed.
 *
 * Security: toString() never exposes cookie values.
 */

export class CookieJar {
  private cookies: Map<string, string> = new Map();

  /** Parse Set-Cookie headers from a fetch Response and store them. */
  applyResponse(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie();

    for (const header of setCookieHeaders) {
      // Take only the first segment before ";" (ignore attributes)
      const cookiePart = header.split(";")[0].trim();
      if (!cookiePart) continue;

      // Split on first "=" only to handle values containing "="
      const eqIndex = cookiePart.indexOf("=");
      if (eqIndex === -1) continue;

      const name = cookiePart.slice(0, eqIndex).trim();
      const value = cookiePart.slice(eqIndex + 1);

      if (name) {
        this.cookies.set(name, value);
      }
    }
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
