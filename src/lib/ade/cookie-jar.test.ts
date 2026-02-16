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
