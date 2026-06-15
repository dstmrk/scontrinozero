/**
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import { CookieJar } from "./cookie-jar";

describe("CookieJar", () => {
  describe("constructor", () => {
    it("starts empty", () => {
      const jar = new CookieJar();
      expect(jar.size).toBe(0);
      expect(jar.toHeaderValue()).toBe("");
    });
  });

  describe("applyResponse", () => {
    it("stores a single Set-Cookie from a response", () => {
      const jar = new CookieJar();
      const response = new Response("", {
        headers: [["Set-Cookie", "JSESSIONID=abc123; Path=/; HttpOnly"]],
      });

      jar.applyResponse(response);

      expect(jar.size).toBe(1);
      expect(jar.has("JSESSIONID")).toBe(true);
      expect(jar.toHeaderValue()).toBe("JSESSIONID=abc123");
    });

    it("stores multiple Set-Cookie headers from one response", () => {
      const jar = new CookieJar();
      const response = new Response("", {
        headers: [
          ["Set-Cookie", "JSESSIONID=abc123; Path=/; HttpOnly"],
          ["Set-Cookie", "LFR_SESSION=xyz789; Path=/"],
        ],
      });

      jar.applyResponse(response);

      expect(jar.size).toBe(2);
      expect(jar.has("JSESSIONID")).toBe(true);
      expect(jar.has("LFR_SESSION")).toBe(true);
    });

    it("overwrites a cookie by name when response sets it again", () => {
      const jar = new CookieJar();

      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "JSESSIONID=first; Path=/"]],
        }),
      );

      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "JSESSIONID=second; Path=/"]],
        }),
      );

      expect(jar.size).toBe(1);
      expect(jar.toHeaderValue()).toBe("JSESSIONID=second");
    });

    it("ignores cookie attributes (Path, Domain, HttpOnly, Secure, etc.)", () => {
      const jar = new CookieJar();
      const response = new Response("", {
        headers: [
          [
            "Set-Cookie",
            "SID=val; Path=/; Domain=.example.com; HttpOnly; Secure; SameSite=Strict; Max-Age=3600",
          ],
        ],
      });

      jar.applyResponse(response);

      expect(jar.size).toBe(1);
      expect(jar.toHeaderValue()).toBe("SID=val");
    });

    it("handles cookies with = in the value", () => {
      const jar = new CookieJar();
      const response = new Response("", {
        headers: [["Set-Cookie", "TOKEN=abc=def=ghi; Path=/"]],
      });

      jar.applyResponse(response);

      expect(jar.toHeaderValue()).toBe("TOKEN=abc=def=ghi");
    });

    it("handles empty Set-Cookie array (no-op)", () => {
      const jar = new CookieJar();
      const response = new Response("");

      jar.applyResponse(response);

      expect(jar.size).toBe(0);
    });

    it("keeps a cookie with a positive Max-Age", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/; Max-Age=3600"]],
        }),
      );

      expect(jar.has("SID")).toBe(true);
      expect(jar.toHeaderValue()).toBe("SID=val");
    });

    it("removes a cookie deleted with Max-Age=0", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/"]],
        }),
      );
      expect(jar.has("SID")).toBe(true);

      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/; Max-Age=0"]],
        }),
      );

      expect(jar.has("SID")).toBe(false);
      expect(jar.size).toBe(0);
    });

    it("removes a cookie deleted with a negative Max-Age", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/"]],
        }),
      );

      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Max-Age=-1"]],
        }),
      );

      expect(jar.has("SID")).toBe(false);
    });

    it("ignores Max-Age=0 for a cookie that does not exist (no crash)", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "GONE=x; Max-Age=0"]],
        }),
      );

      expect(jar.size).toBe(0);
    });

    it("removes a cookie with Expires in the past", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/"]],
        }),
      );

      jar.applyResponse(
        new Response("", {
          headers: [
            ["Set-Cookie", "SID=val; Expires=Thu, 01 Jan 1970 00:00:00 GMT"],
          ],
        }),
      );

      expect(jar.has("SID")).toBe(false);
    });

    it("keeps a cookie with Expires in the future", () => {
      const jar = new CookieJar();
      const future = new Date(Date.now() + 86_400_000).toUTCString();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", `SID=val; Expires=${future}`]],
        }),
      );

      expect(jar.has("SID")).toBe(true);
    });

    it("ignores a malformed Expires and keeps the cookie (no false delete)", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Expires=not-a-date"]],
        }),
      );

      expect(jar.has("SID")).toBe(true);
      expect(jar.toHeaderValue()).toBe("SID=val");
    });

    it("removes a cookie set with an empty value", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/"]],
        }),
      );

      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=; Path=/"]],
        }),
      );

      expect(jar.has("SID")).toBe(false);
    });

    it("keeps an empty-valued cookie kept alive by a positive Max-Age", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=; Max-Age=3600"]],
        }),
      );

      expect(jar.has("SID")).toBe(true);
      expect(jar.toHeaderValue()).toBe("SID=");
    });

    it("gives Max-Age precedence over a contradictory Expires (RFC 6265)", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Path=/"]],
        }),
      );

      // Max-Age=0 (delete) wins over a future Expires (keep).
      const future = new Date(Date.now() + 86_400_000).toUTCString();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", `SID=val; Max-Age=0; Expires=${future}`]],
        }),
      );

      expect(jar.has("SID")).toBe(false);
    });

    it("ignores a non-numeric Max-Age and falls back to value/expires", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=val; Max-Age=abc"]],
        }),
      );

      expect(jar.has("SID")).toBe(true);
      expect(jar.toHeaderValue()).toBe("SID=val");
    });
  });

  describe("toHeaderValue", () => {
    it("returns semicolon-separated name=value pairs", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [
            ["Set-Cookie", "A=1; Path=/"],
            ["Set-Cookie", "B=2; Path=/"],
            ["Set-Cookie", "C=3; Path=/"],
          ],
        }),
      );

      const value = jar.toHeaderValue();
      expect(value).toContain("A=1");
      expect(value).toContain("B=2");
      expect(value).toContain("C=3");
      expect(value.split("; ").length).toBe(3);
    });

    it("returns empty string when jar is empty", () => {
      const jar = new CookieJar();
      expect(jar.toHeaderValue()).toBe("");
    });
  });

  describe("has", () => {
    it("returns true for stored cookie name", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [["Set-Cookie", "SID=abc; Path=/"]],
        }),
      );

      expect(jar.has("SID")).toBe(true);
    });

    it("returns false for absent cookie name", () => {
      const jar = new CookieJar();
      expect(jar.has("MISSING")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all cookies", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [
            ["Set-Cookie", "A=1; Path=/"],
            ["Set-Cookie", "B=2; Path=/"],
          ],
        }),
      );

      expect(jar.size).toBe(2);

      jar.clear();

      expect(jar.size).toBe(0);
      expect(jar.toHeaderValue()).toBe("");
    });
  });

  describe("toString", () => {
    it("returns redacted summary, never cookie values", () => {
      const jar = new CookieJar();
      jar.applyResponse(
        new Response("", {
          headers: [
            ["Set-Cookie", "SECRET=supersecret; Path=/"],
            ["Set-Cookie", "TOKEN=mytoken; Path=/"],
          ],
        }),
      );

      const str = jar.toString();
      expect(str).toBe("CookieJar(2 cookies)");
      expect(str).not.toContain("supersecret");
      expect(str).not.toContain("mytoken");
    });
  });
});
