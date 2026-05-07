import { describe, expect, it } from "vitest";
import {
  getFormString,
  getFormStringOrNull,
  getFormStringRaw,
  objectToFormData,
} from "./form-utils";

describe("getFormString", () => {
  it("ritorna stringa trimmed", () => {
    const fd = new FormData();
    fd.set("name", "  Mario Rossi  ");
    expect(getFormString(fd, "name")).toBe("Mario Rossi");
  });

  it("ritorna stringa vuota se la chiave manca", () => {
    const fd = new FormData();
    expect(getFormString(fd, "missing")).toBe("");
  });

  it("ritorna stringa vuota se il valore è un File", () => {
    const fd = new FormData();
    fd.set("upload", new File(["data"], "f.txt", { type: "text/plain" }));
    expect(getFormString(fd, "upload")).toBe("");
  });

  it("ritorna stringa vuota se il valore è whitespace puro", () => {
    const fd = new FormData();
    fd.set("blank", "   ");
    expect(getFormString(fd, "blank")).toBe("");
  });
});

describe("getFormStringRaw", () => {
  it("preserva gli spazi (campi password — semantica byte-per-byte)", () => {
    const fd = new FormData();
    fd.set("password", "  myPassword  ");
    expect(getFormStringRaw(fd, "password")).toBe("  myPassword  ");
  });

  it("ritorna stringa vuota se la chiave manca", () => {
    const fd = new FormData();
    expect(getFormStringRaw(fd, "missing")).toBe("");
  });

  it("ritorna stringa vuota se il valore è un File", () => {
    const fd = new FormData();
    fd.set("upload", new File(["data"], "f.txt", { type: "text/plain" }));
    expect(getFormStringRaw(fd, "upload")).toBe("");
  });

  it("preserva whitespace puro (l'input password può essere solo spazi)", () => {
    const fd = new FormData();
    fd.set("blank", "   ");
    expect(getFormStringRaw(fd, "blank")).toBe("   ");
  });
});

describe("getFormStringOrNull", () => {
  it("ritorna null se vuota o whitespace", () => {
    const fd = new FormData();
    fd.set("blank", "  ");
    expect(getFormStringOrNull(fd, "blank")).toBeNull();
    expect(getFormStringOrNull(fd, "missing")).toBeNull();
  });

  it("ritorna trimmed altrimenti", () => {
    const fd = new FormData();
    fd.set("v", " ciao ");
    expect(getFormStringOrNull(fd, "v")).toBe("ciao");
  });
});

describe("objectToFormData", () => {
  it("salta entry null/undefined", () => {
    const fd = objectToFormData({ a: "1", b: null, c: undefined, d: "2" });
    expect(fd.get("a")).toBe("1");
    expect(fd.has("b")).toBe(false);
    expect(fd.has("c")).toBe(false);
    expect(fd.get("d")).toBe("2");
  });

  it("stringifica number e boolean", () => {
    const fd = objectToFormData({ count: 5, active: true, label: "x" });
    expect(fd.get("count")).toBe("5");
    expect(fd.get("active")).toBe("true");
    expect(fd.get("label")).toBe("x");
  });

  it("preserva la stringa vuota (utile per default lato server)", () => {
    const fd = objectToFormData({ businessName: "" });
    expect(fd.get("businessName")).toBe("");
  });
});
