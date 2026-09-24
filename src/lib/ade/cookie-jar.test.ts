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

    it.each([
      {
        name: "keeps a cookie with a positive Max-Age",
        responses: ["SID=val; Path=/; Max-Age=3600"],
        expectedHas: { name: "SID", present: true },
        expectedHeaderValue: "SID=val",
      },
      {
        name: "removes a cookie deleted with Max-Age=0",
        responses: ["SID=val; Path=/", "SID=val; Path=/; Max-Age=0"],
        expectedHas: { name: "SID", present: false },
        expectedSize: 0,
      },
      {
        name: "removes a cookie deleted with a negative Max-Age",
        responses: ["SID=val; Path=/", "SID=val; Max-Age=-1"],
        expectedHas: { name: "SID", present: false },
      },
      {
        name: "ignores Max-Age=0 for a cookie that does not exist (no crash)",
        responses: ["GONE=x; Max-Age=0"],
        expectedSize: 0,
      },
      {
        name: "ignores a malformed Expires and keeps the cookie (no false delete)",
        responses: ["SID=val; Expires=not-a-date"],
        expectedHas: { name: "SID", present: true },
        expectedHeaderValue: "SID=val",
      },
      {
        name: "keeps an empty-valued cookie kept alive by a positive Max-Age",
        responses: ["SID=; Max-Age=3600"],
        expectedHas: { name: "SID", present: true },
        expectedHeaderValue: "SID=",
      },
      {
        name: "ignores a non-numeric Max-Age and falls back to value/expires",
        responses: ["SID=val; Max-Age=abc"],
        expectedHas: { name: "SID", present: true },
        expectedHeaderValue: "SID=val",
      },
    ] as {
      name: string;
      responses: string[];
      expectedHas?: { name: string; present: boolean };
      expectedSize?: number;
      expectedHeaderValue?: string;
    }[])(
      "$name",
      ({ responses, expectedHas, expectedSize, expectedHeaderValue }) => {
        const jar = new CookieJar();
        for (const setCookie of responses) {
          jar.applyResponse(
            new Response("", { headers: [["Set-Cookie", setCookie]] }),
          );
        }

        if (expectedHas) {
          expect(jar.has(expectedHas.name)).toBe(expectedHas.present);
        }
        if (expectedSize !== undefined) {
          expect(jar.size).toBe(expectedSize);
        }
        if (expectedHeaderValue !== undefined) {
          expect(jar.toHeaderValue()).toBe(expectedHeaderValue);
        }
      },
    );

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
      expect(value.split("; ")).toHaveLength(3);
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

describe("CookieJar.loadHeader", () => {
  it("carica un header Cookie di più coppie", () => {
    const jar = new CookieJar();
    jar.loadHeader("JSESSIONID=abc; LtpaToken2=xyz");
    expect(jar.size).toBe(2);
    expect(jar.toHeaderValue()).toBe("JSESSIONID=abc; LtpaToken2=xyz");
  });

  it("taglia sul primo '=': i valori base64 col padding restano interi", () => {
    const jar = new CookieJar();
    jar.loadHeader("B2BCookie=aGVsbG8=.12Z1I2/Di9BTjJAKhOmvbA==");
    expect(jar.toHeaderValue()).toBe(
      "B2BCookie=aGVsbG8=.12Z1I2/Di9BTjJAKhOmvbA==",
    );
  });

  it("ignora spazi, segmenti vuoti, un ';' finale e il newline di un incolla", () => {
    const jar = new CookieJar();
    jar.loadHeader("  a=1 ;;  b=2;\n");
    expect(jar.toHeaderValue()).toBe("a=1; b=2");
  });

  it("salta i segmenti senza nome, senza '=' o con valore vuoto", () => {
    const jar = new CookieJar();
    jar.loadHeader("=orfano; senzauguale; vuoto=; ok=1");
    expect(jar.toHeaderValue()).toBe("ok=1");
  });

  it("su nomi ripetuti vince l'ultimo, come in un Set-Cookie successivo", () => {
    const jar = new CookieJar();
    jar.loadHeader("a=1; a=2");
    expect(jar.size).toBe(1);
    expect(jar.toHeaderValue()).toBe("a=2");
  });

  it("si somma ai cookie già presenti invece di sostituirli", () => {
    const jar = new CookieJar();
    jar.loadHeader("a=1");
    jar.loadHeader("b=2");
    expect(jar.toHeaderValue()).toBe("a=1; b=2");
  });

  it("un header vuoto non carica niente", () => {
    const jar = new CookieJar();
    jar.loadHeader("");
    expect(jar.size).toBe(0);
  });

  it("toString non espone i valori caricati", () => {
    const jar = new CookieJar();
    jar.loadHeader("JSESSIONID=segretissimo");
    expect(jar.toString()).not.toContain("segretissimo");
  });
});
