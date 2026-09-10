// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const { mockSendEmail, mockLoggerWarn, mockLoggerError } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: mockLoggerError },
}));

const SECRET_BASE64 = "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const APP_HOSTNAME = "app.scontrinozero.it";
const SUPABASE_URL = "https://abcdefgh.supabase.co";
const REDIRECT_TO = `https://${APP_HOSTNAME}/callback?redirect=%2Fdashboard`;

function payloadFor(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    user: { email: "mario@esempio.it" },
    email_data: {
      token: "123456",
      token_hash: "pkce_deadbeef",
      email_action_type: "signup",
      redirect_to: REDIRECT_TO,
      site_url: `https://${APP_HOSTNAME}`,
      ...overrides,
    },
  });
}

function signedRequest(
  payload: string,
  {
    secret = SECRET_BASE64,
    id = "msg_test",
    timestampMs = Date.now(),
    signature,
  }: {
    secret?: string;
    id?: string;
    timestampMs?: number;
    signature?: string;
  } = {},
): Request {
  const timestamp = String(Math.floor(timestampMs / 1000));
  const computed = `v1,${createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64")}`;

  return new Request(`https://${APP_HOSTNAME}/api/auth/send-email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature ?? computed,
    },
    body: payload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
  process.env.SEND_EMAIL_HOOK_SECRET = `v1,whsec_${SECRET_BASE64}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.APP_HOSTNAME = APP_HOSTNAME;
});

afterEach(() => {
  delete process.env.SEND_EMAIL_HOOK_SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.APP_HOSTNAME;
});

describe("POST /api/auth/send-email", () => {
  it("manda la conferma via Resend e risponde 200", async () => {
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor()));

    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mario@esempio.it",
        subject: expect.stringContaining("Conferma"),
      }),
    );
  });

  it("costruisce il link di verifica sull'issuer Supabase, col token e il redirect", async () => {
    const { POST } = await import("./route");

    await POST(signedRequest(payloadFor()));

    const link = new URL(
      mockSendEmail.mock.calls[0][0].react.props.confirmLink,
    );
    expect(link.origin).toBe(SUPABASE_URL);
    expect(link.pathname).toBe("/auth/v1/verify");
    expect(link.searchParams.get("token")).toBe("pkce_deadbeef");
    expect(link.searchParams.get("type")).toBe("signup");
    expect(link.searchParams.get("redirect_to")).toBe(REDIRECT_TO);
  });

  it("sostituisce un redirect_to fuori dal dominio app col valore canonico", async () => {
    const { POST } = await import("./route");

    await POST(requestWithRedirectTo("https://phishing.example/callback"));

    const link = new URL(
      mockSendEmail.mock.calls[0][0].react.props.confirmLink,
    );
    expect(link.searchParams.get("redirect_to")).toBe(
      `https://${APP_HOSTNAME}/callback?redirect=%2Fdashboard`,
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("sostituisce un redirect_to malformato col valore canonico", async () => {
    const { POST } = await import("./route");

    await POST(requestWithRedirectTo("non-un-url"));

    const link = new URL(
      mockSendEmail.mock.calls[0][0].react.props.confirmLink,
    );
    expect(link.searchParams.get("redirect_to")).toBe(
      `https://${APP_HOSTNAME}/callback?redirect=%2Fdashboard`,
    );
  });

  it("rifiuta con 401 una firma non valida, senza mandare nulla", async () => {
    const { POST } = await import("./route");

    const res = await POST(
      signedRequest(payloadFor(), { signature: "v1,ZmFrZQ==" }),
    );

    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it("rifiuta con 401 un body riscritto dopo la firma", async () => {
    const { POST } = await import("./route");
    const original = payloadFor();
    const tampered = original.replace(
      "mario@esempio.it",
      "attaccante@evil.example",
    );
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v1,${createHmac(
      "sha256",
      Buffer.from(SECRET_BASE64, "base64"),
    )
      .update(`msg_test.${timestamp}.${original}`)
      .digest("base64")}`;

    const res = await POST(
      new Request(`https://${APP_HOSTNAME}/api/auth/send-email`, {
        method: "POST",
        headers: {
          "webhook-id": "msg_test",
          "webhook-timestamp": timestamp,
          "webhook-signature": signature,
        },
        body: tampered,
      }),
    );

    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("una firma valida ma vecchia non si può rigiocare", async () => {
    const { POST } = await import("./route");

    const res = await POST(
      signedRequest(payloadFor(), { timestampMs: Date.now() - 10 * 60 * 1000 }),
    );

    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("non logga un errore Sentry per una firma sbagliata (regola 20)", async () => {
    const { POST } = await import("./route");

    await POST(signedRequest(payloadFor(), { signature: "v1,ZmFrZQ==" }));

    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("risponde 500 senza segreto configurato", async () => {
    delete process.env.SEND_EMAIL_HOOK_SECRET;
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor()));

    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("risponde 500 con un segreto illeggibile, distinguendolo da una firma sbagliata", async () => {
    process.env.SEND_EMAIL_HOOK_SECRET = "";
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor()));

    expect(res.status).toBe(500);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("distingue un segreto presente ma illeggibile: 500, non 401", async () => {
    // `v1,whsec_` senza base64 dietro: la chiave esce vuota. Non è una
    // richiesta ostile, è configurazione rotta, e va detta come tale.
    process.env.SEND_EMAIL_HOOK_SECRET = "v1,whsec_";
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor()));

    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rifiuta con 413 un body oltre il limite, prima di verificare la firma", async () => {
    const { POST } = await import("./route");
    const huge = payloadFor({ token_hash: "x".repeat(64 * 1024) });

    const res = await POST(signedRequest(huge));

    expect(res.status).toBe(413);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rifiuta con 400 un payload senza token_hash", async () => {
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor({ token_hash: "" })));

    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rifiuta con 400 un payload senza email valida", async () => {
    const { POST } = await import("./route");
    const payload = JSON.stringify({
      user: { email: "non-una-email" },
      email_data: {
        token_hash: "pkce_deadbeef",
        email_action_type: "signup",
        redirect_to: REDIRECT_TO,
      },
    });

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rifiuta con 400 un body che non è JSON", async () => {
    const { POST } = await import("./route");

    const res = await POST(signedRequest("non-json"));

    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("fallisce rumorosamente su un email_action_type che non sappiamo rendere", async () => {
    const { POST } = await import("./route");

    const res = await POST(
      signedRequest(payloadFor({ email_action_type: "magiclink" })),
    );

    expect(res.status).toBe(500);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("risponde 500 se Resend fallisce, così GoTrue non dà per spedita una mail persa", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend down"));
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor()));

    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("risponde 500 senza NEXT_PUBLIC_SUPABASE_URL", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { POST } = await import("./route");

    const res = await POST(signedRequest(payloadFor()));

    expect(res.status).toBe(500);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("espone l'errore nella forma che GoTrue sa leggere", async () => {
    const { POST } = await import("./route");

    const res = await POST(
      signedRequest(payloadFor(), { signature: "v1,ZmFrZQ==" }),
    );

    await expect(res.json()).resolves.toEqual({
      error: { http_code: 401, message: expect.any(String) },
    });
  });
});

/** Richiesta firmata con un `redirect_to` scelto dal caso di test. */
function requestWithRedirectTo(redirectTo: string): Request {
  return signedRequest(payloadFor({ redirect_to: redirectTo }));
}
