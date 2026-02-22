import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const values = vi.fn().mockReturnValue({ onConflictDoNothing });
const insert = vi.fn().mockReturnValue({ values });

vi.mock("@/db", () => ({
  getDb: () => ({ insert: (...args: unknown[]) => insert(...args) }),
}));

vi.mock("@/db/schema", () => ({
  waitlist: Symbol("waitlist"),
}));

const { mockCheck } = vi.hoisted(() => ({
  mockCheck: vi
    .fn()
    .mockReturnValue({ success: true, remaining: 9, resetAt: 0 }),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: class {
    check(key: string) {
      return mockCheck(key);
    }
  },
}));

import { POST } from "./route";
import { waitlist } from "@/db/schema";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockReturnValue({ success: true, remaining: 9, resetAt: 0 });
  });

  it("inserts a valid email and returns ok", async () => {
    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(waitlist);
    expect(values).toHaveBeenCalledWith({
      email: "user@example.com",
    });
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("lowercases the email before insert", async () => {
    await POST(makeRequest({ email: "User@Example.COM" }));

    expect(values).toHaveBeenCalledWith({
      email: "user@example.com",
    });
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Email obbligatoria.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 400 when email is not a string", async () => {
    const res = await POST(makeRequest({ email: 123 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Email obbligatoria.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Email non valida.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 200 on duplicate email (onConflictDoNothing)", async () => {
    // onConflictDoNothing silently succeeds on duplicates
    const res = await POST(makeRequest({ email: "dup@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it("returns 429 when rate limited", async () => {
    mockCheck.mockReturnValueOnce({ success: false, remaining: 0, resetAt: 0 });

    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toContain("Troppi tentativi");
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 400 when JSON payload is malformed", async () => {
    const request = new NextRequest("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email":',
    });

    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Payload JSON non valido.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    onConflictDoNothing.mockRejectedValueOnce(new Error("connection lost"));

    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Errore interno. Riprova più tardi.");
  });
});
