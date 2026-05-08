import { describe, it, expect } from "vitest";
import { dbTimeoutResponse, isStatementTimeoutError } from "./api-errors";

describe("isStatementTimeoutError", () => {
  it("riconosce un PostgresError con code 57014", () => {
    const err = Object.assign(
      new Error("canceling statement due to statement timeout"),
      {
        code: "57014",
      },
    );
    expect(isStatementTimeoutError(err)).toBe(true);
  });

  it("ignora un Error senza code", () => {
    expect(isStatementTimeoutError(new Error("boom"))).toBe(false);
  });

  it("ignora un PostgresError con code diverso", () => {
    const err = Object.assign(new Error("unique violation"), { code: "23505" });
    expect(isStatementTimeoutError(err)).toBe(false);
  });

  it("ignora valori non-Error / non-oggetto", () => {
    expect(isStatementTimeoutError(null)).toBe(false);
    expect(isStatementTimeoutError(undefined)).toBe(false);
    expect(isStatementTimeoutError("57014")).toBe(false);
    expect(isStatementTimeoutError(57014)).toBe(false);
    expect(isStatementTimeoutError({ code: 57014 })).toBe(false); // numero, non stringa
  });

  it("riconosce oggetti plain con code 57014 (errori postgres-js non sono Error)", () => {
    // postgres-js lancia oggetti `PostgresError` che ereditano da Error;
    // accettiamo anche oggetti plain con la stessa shape per robustezza.
    expect(isStatementTimeoutError({ code: "57014" })).toBe(true);
  });
});

describe("dbTimeoutResponse", () => {
  it("ritorna un Response 503 con body JSON canonico", async () => {
    const res = dbTimeoutResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toMatch(/json/i);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("imposta header Retry-After con un valore intero in secondi", () => {
    const res = dbTimeoutResponse();
    const retry = res.headers.get("retry-after");
    expect(retry).not.toBeNull();
    expect(retry).toMatch(/^\d+$/);
    expect(Number(retry)).toBeGreaterThan(0);
  });

  it("usa un error code machine-readable nel body", async () => {
    const body = (await dbTimeoutResponse().json()) as { code?: string };
    expect(body.code).toBe("DB_TIMEOUT");
  });
});
