import { describe, expect, it } from "vitest";
import { CSV_BOM, escapeCsvField, rowToCsv, rowsToCsv } from "./csv";

describe("escapeCsvField", () => {
  it("returns the string as-is when no special chars are present", () => {
    expect(escapeCsvField("ciao")).toBe("ciao");
  });

  it("wraps a value containing a comma in double quotes", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("wraps a value containing a double quote and doubles the quote (RFC 4180)", () => {
    expect(escapeCsvField('a"b')).toBe('"a""b"');
  });

  it("wraps a value containing CR/LF in double quotes", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
    expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("converts numbers to strings", () => {
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(3.14)).toBe("3.14");
  });

  it("converts booleans to strings", () => {
    expect(escapeCsvField(true)).toBe("true");
    expect(escapeCsvField(false)).toBe("false");
  });

  it("converts Date to ISO string", () => {
    expect(escapeCsvField(new Date("2026-05-19T12:34:56Z"))).toBe(
      "2026-05-19T12:34:56.000Z",
    );
  });

  it("guards against CSV formula injection by prefixing dangerous leaders with apostrophe", () => {
    expect(escapeCsvField("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(escapeCsvField("+1+1")).toBe("'+1+1");
    expect(escapeCsvField("-2+3")).toBe("'-2+3");
    expect(escapeCsvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvField("\tcmd")).toBe("'\tcmd");
  });

  it("does not treat a comma-containing value starting with = as exempt from quoting", () => {
    expect(escapeCsvField("=A1,B1")).toBe('"\'=A1,B1"');
  });

  it("does not escape a regular value starting with a number", () => {
    expect(escapeCsvField("12345")).toBe("12345");
  });
});

describe("rowToCsv", () => {
  it("joins fields with comma and terminates with CRLF (RFC 4180)", () => {
    expect(rowToCsv(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("escapes each field independently", () => {
    expect(rowToCsv(["a,b", 'c"d', "ok"])).toBe('"a,b","c""d",ok\r\n');
  });

  it("handles null and undefined values as empty fields", () => {
    expect(rowToCsv(["a", null, undefined, "b"])).toBe("a,,,b\r\n");
  });

  it("emits empty row when given an empty array", () => {
    expect(rowToCsv([])).toBe("\r\n");
  });
});

describe("rowsToCsv", () => {
  it("concatenates multiple rows with CRLF separators", () => {
    expect(
      rowsToCsv([
        ["h1", "h2"],
        ["v1", "v2"],
      ]),
    ).toBe("h1,h2\r\nv1,v2\r\n");
  });

  it("returns empty string when given no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });
});

describe("CSV_BOM", () => {
  it("is the UTF-8 BOM character (U+FEFF) for Excel italiano compatibility", () => {
    expect(CSV_BOM).toBe("﻿");
    expect(CSV_BOM).toHaveLength(1);
  });
});
