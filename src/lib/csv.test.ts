import { describe, expect, it } from "vitest";
import { CSV_BOM, CSV_SEPARATOR, escapeCsvField, rowToCsv } from "./csv";

describe("escapeCsvField", () => {
  it("returns the string as-is when no special chars are present", () => {
    expect(escapeCsvField("ciao")).toBe("ciao");
  });

  it("wraps a value containing the separator in double quotes", () => {
    expect(escapeCsvField("a;b")).toBe('"a;b"');
  });

  // Il separatore e' `;`, quindi la virgola e' un carattere qualunque: e'
  // quello che rende leggibile `12,50` senza virgolette in ogni cella importo.
  it("lascia la virgola senza quoting (e' il separatore decimale italiano)", () => {
    expect(escapeCsvField("12,50")).toBe("12,50");
    expect(escapeCsvField("Caffè, doppio")).toBe("Caffè, doppio");
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

  it("quota comunque un valore che inizia con = e contiene il separatore", () => {
    expect(escapeCsvField("=A1;B1")).toBe('"\'=A1;B1"');
  });

  it("does not escape a regular value starting with a number", () => {
    expect(escapeCsvField("12345")).toBe("12345");
  });
});

describe("CSV_SEPARATOR", () => {
  // Excel italiano usa il separatore di elenco di sistema (`;`): con la
  // virgola il file si apre tutto in una colonna sola.
  it("e' il punto e virgola", () => {
    expect(CSV_SEPARATOR).toBe(";");
  });
});

describe("rowToCsv", () => {
  it("unisce i campi con `;` e chiude con CRLF (RFC 4180)", () => {
    expect(rowToCsv(["a", "b", "c"])).toBe("a;b;c\r\n");
  });

  it("escapes each field independently", () => {
    expect(rowToCsv(["a;b", 'c"d', "ok"])).toBe('"a;b";"c""d";ok\r\n');
  });

  it("handles null and undefined values as empty fields", () => {
    expect(rowToCsv(["a", null, undefined, "b"])).toBe("a;;;b\r\n");
  });

  it("emits empty row when given an empty array", () => {
    expect(rowToCsv([])).toBe("\r\n");
  });

  it("tiene gli importi italiani in una cella sola, senza virgolette", () => {
    expect(rowToCsv(["19/05/2026", "12,50", "Caffè"])).toBe(
      "19/05/2026;12,50;Caffè\r\n",
    );
  });
});

describe("CSV_BOM", () => {
  it("is the UTF-8 BOM character (U+FEFF) for Excel italiano compatibility", () => {
    expect(CSV_BOM).toBe("﻿");
    expect(CSV_BOM).toHaveLength(1);
  });
});
