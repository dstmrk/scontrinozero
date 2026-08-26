// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ADMIN_QUERY_TIMEOUT_MS,
  toNullableText,
  toNumber,
  toRows,
  toText,
} from "./admin-sql";

describe("toNumber", () => {
  it("converte i bigint che il driver consegna come stringa", () => {
    expect(toNumber("1234567")).toBe(1234567);
  });

  it("lascia passare un numero finito", () => {
    expect(toNumber(42)).toBe(42);
  });

  it("tratta come 0 null, undefined e valori non numerici", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber({})).toBe(0);
    expect(toNumber("non-un-numero")).toBe(0);
    expect(toNumber(Number.NaN)).toBe(0);
    expect(toNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("toRows", () => {
  it("passa attraverso un array già parsato", () => {
    expect(toRows([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("parsa un json consegnato come testo", () => {
    expect(toRows('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("degrada a elenco vuoto su json illeggibile o non-array", () => {
    expect(toRows("{non-json")).toEqual([]);
    expect(toRows('{"a":1}')).toEqual([]);
    expect(toRows(null)).toEqual([]);
    expect(toRows(undefined)).toEqual([]);
  });
});

describe("toNullableText / toText", () => {
  it("toNullableText normalizza a null tutto ciò che non è testo non vuoto", () => {
    expect(toNullableText("Mario")).toBe("Mario");
    expect(toNullableText("")).toBeNull();
    expect(toNullableText(null)).toBeNull();
    expect(toNullableText(7)).toBeNull();
  });

  it("toText non restituisce mai null", () => {
    expect(toText("a@b.it")).toBe("a@b.it");
    expect(toText(null)).toBe("");
  });
});

describe("ADMIN_QUERY_TIMEOUT_MS", () => {
  it("è un intero positivo, come richiede withStatementTimeout", () => {
    expect(Number.isInteger(ADMIN_QUERY_TIMEOUT_MS)).toBe(true);
    expect(ADMIN_QUERY_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
