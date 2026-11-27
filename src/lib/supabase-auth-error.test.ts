import { describe, expect, it } from "vitest";
import {
  classifySupabaseAuthError,
  SUPABASE_AUTH_ERROR_CLASSES,
} from "./supabase-auth-error";

describe("classifySupabaseAuthError", () => {
  it.each([
    [{ status: 400, message: "Invalid login credentials" }, "invalid_login"],
    [{ status: 400, message: "Email not confirmed" }, "email_not_confirmed"],
    [{ status: 422, message: "whatever" }, "validation_error"],
    [{ status: 429, message: "rate limit" }, "supabase_throttled"],
    [{ status: 500, message: "upstream" }, "supabase_5xx"],
    [{ status: 503 }, "supabase_5xx"],
    [{ status: 400, message: "something else" }, "other"],
    [{}, "other"],
  ])("classifica %o come %s", (err, expected) => {
    expect(classifySupabaseAuthError(err)).toBe(expected);
  });

  it("ritorna solo valori dichiarati in SUPABASE_AUTH_ERROR_CLASSES", () => {
    const seen = [
      { status: 400, message: "Invalid login credentials" },
      { status: 400, message: "Email not confirmed" },
      { status: 422 },
      { status: 429 },
      { status: 500 },
      {},
    ].map(classifySupabaseAuthError);
    expect(new Set(seen)).toEqual(new Set(SUPABASE_AUTH_ERROR_CLASSES));
  });
});
