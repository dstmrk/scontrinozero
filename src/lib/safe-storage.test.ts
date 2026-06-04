// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalStorage, safeSessionStorage } from "./safe-storage";

const cases = [
  { name: "safeSessionStorage", store: safeSessionStorage, key: "session" },
  { name: "safeLocalStorage", store: safeLocalStorage, key: "local" },
] as const;

function denyAccess(prop: "sessionStorage" | "localStorage") {
  vi.spyOn(window, prop, "get").mockImplementation(() => {
    throw new DOMException(
      "Access is denied for this document.",
      "SecurityError",
    );
  });
}

describe.each(cases)("$name", ({ store, key }) => {
  const prop = key === "session" ? "sessionStorage" : "localStorage";
  const native = key === "session" ? sessionStorage : localStorage;

  afterEach(() => {
    vi.restoreAllMocks();
    native.clear();
  });

  it("round-trips a value (set → get)", () => {
    store.setItem("k", "v");
    expect(store.getItem("k")).toBe("v");
    expect(native.getItem("k")).toBe("v");
  });

  it("returns null for a missing key", () => {
    expect(store.getItem("missing")).toBeNull();
  });

  it("removeItem deletes the value", () => {
    native.setItem("k", "v");
    store.removeItem("k");
    expect(native.getItem("k")).toBeNull();
  });

  it("getItem returns null when storage access is denied (SecurityError)", () => {
    denyAccess(prop);
    expect(() => store.getItem("k")).not.toThrow();
    expect(store.getItem("k")).toBeNull();
  });

  it("setItem no-ops (no throw) when storage access is denied", () => {
    denyAccess(prop);
    expect(() => store.setItem("k", "v")).not.toThrow();
  });

  it("removeItem no-ops (no throw) when storage access is denied", () => {
    denyAccess(prop);
    expect(() => store.removeItem("k")).not.toThrow();
  });

  it("getItem returns null when the underlying getItem throws", () => {
    vi.spyOn(native, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(store.getItem("k")).toBeNull();
  });

  it("setItem swallows a thrown quota/security error", () => {
    vi.spyOn(native, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceeded", "QuotaExceededError");
    });
    expect(() => store.setItem("k", "v")).not.toThrow();
  });

  it("removeItem swallows a thrown error", () => {
    vi.spyOn(native, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => store.removeItem("k")).not.toThrow();
  });
});

describe("safe-storage SSR (no window)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getItem returns null and writes no-op when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(safeSessionStorage.getItem("k")).toBeNull();
    expect(safeLocalStorage.getItem("k")).toBeNull();
    expect(() => safeSessionStorage.setItem("k", "v")).not.toThrow();
    expect(() => safeLocalStorage.removeItem("k")).not.toThrow();
  });
});
