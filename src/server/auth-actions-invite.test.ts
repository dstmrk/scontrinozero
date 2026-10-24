// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `acceptCollaboratorInvite`: la registrazione di un collaboratore dal link
 * d'invito (issue #1099, PR 6a). Suite separata da `auth-actions.test.ts`
 * perché i suoi mock (invito, membership, admin.createUser) non servono agli
 * altri flussi.
 */

const {
  mockRateLimiterCheck,
  mockSignInWithPassword,
  mockCreateUser,
  mockDeleteUser,
  mockFindInviteByToken,
  mockEmailHasAccount,
  mockTxDelete,
  mockTxInsert,
  mockFetch,
} = vi.hoisted(() => ({
  mockRateLimiterCheck: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockCreateUser: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockFindInviteByToken: vi.fn(),
  mockEmailHasAccount: vi.fn(),
  mockTxDelete: vi.fn(),
  mockTxInsert: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { signInWithPassword: mockSignInWithPassword },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn().mockReturnValue({
    auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
  }),
}));
vi.mock("@/db", () => ({
  getDb: () => ({
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({ delete: mockTxDelete, insert: mockTxInsert }),
  }),
}));
vi.mock("@/lib/collaborator-invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/collaborator-invites")>()),
  findInviteByToken: mockFindInviteByToken,
  emailHasAccount: mockEmailHasAccount,
}));
vi.mock("@/lib/partners/partner-context", () => ({
  getPartnerBySlug: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn((key: string) =>
      key.toLowerCase() === "host" ? "app.scontrinozero.it" : "127.0.0.1",
    ),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT",
      url,
    });
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import { PgDialect } from "drizzle-orm/pg-core";
import { hashInviteToken } from "@/lib/collaborator-invites";
import { acceptCollaboratorInvite } from "./auth-actions";

const TOKEN = "a".repeat(43);
const BIZ = "11111111-1111-4111-8111-111111111111";
const INVITE = {
  id: "inv-1",
  businessId: BIZ,
  email: "anna@example.com",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  businessName: "Bar Centrale",
};
const UNAVAILABLE =
  "Questo invito non è più valido: chiedi al titolare di mandartene uno nuovo.";
const HAS_ACCOUNT =
  "Questa email ha già un account ScontrinoZero: accedi, oppure chiedi al titolare di invitare un altro indirizzo.";

function acceptForm(overrides: Record<string, string | null> = {}): FormData {
  const values: Record<string, string | null> = {
    token: TOKEN,
    name: "  Anna Bianchi ",
    password: "Secure#99x",
    confirmPassword: "Secure#99x",
    termsAccepted: "true",
    specificClausesAccepted: "true",
    captchaToken: "captcha",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) fd.set(key, value);
  }
  return fd;
}

let claimReturning: ReturnType<typeof vi.fn>;
let memberValues: ReturnType<typeof vi.fn>;
let claimWhere: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  mockRateLimiterCheck.mockReturnValue({ success: true, remaining: 4 });
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      hostname: "app.scontrinozero.it",
      action: "accept-invite",
    }),
  });
  mockFindInviteByToken.mockResolvedValue(INVITE);
  mockEmailHasAccount.mockResolvedValue(false);
  mockCreateUser.mockResolvedValue({
    data: { user: { id: "collab-auth" } },
    error: null,
  });
  mockDeleteUser.mockResolvedValue({ error: null });
  mockSignInWithPassword.mockResolvedValue({ error: null });

  claimReturning = vi.fn().mockResolvedValue([{ id: INVITE.id }]);
  claimWhere = vi.fn(() => ({ returning: claimReturning }));
  mockTxDelete.mockReturnValue({ where: claimWhere });
  memberValues = vi.fn().mockResolvedValue(undefined);
  mockTxInsert.mockReturnValue({ values: memberValues });
});

describe("acceptCollaboratorInvite", () => {
  it("crea l'account con l'email dell'invito, lo lega all'attività ed entra", async () => {
    await expect(acceptCollaboratorInvite(acceptForm())).resolves.toEqual({});

    expect(mockFindInviteByToken).toHaveBeenCalledWith(TOKEN);
    // Il link prova già la proprietà dell'email: nessuna conferma separata.
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: "anna@example.com",
      password: "Secure#99x",
      email_confirm: true,
    });
    expect(memberValues).toHaveBeenCalledWith({
      businessId: BIZ,
      authUserId: "collab-auth",
      role: "collaborator",
      name: "Anna Bianchi",
      email: "anna@example.com",
      termsAcceptedAt: expect.any(Date),
      termsVersion: "v01",
      collaboratorTermsVersion: "v01",
    });
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "anna@example.com",
      password: "Secure#99x",
    });
  });

  it("verifica il captcha con l'azione del flusso d'invito", async () => {
    await acceptCollaboratorInvite(acceptForm());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response).toBe("captcha");
  });

  it("un captcha emesso per un altro flusso non vale", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hostname: "app.scontrinozero.it",
        action: "signup",
      }),
    });

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe("Verifica CAPTCHA fallita. Riprova.");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["token malformato", { token: "corto" }, UNAVAILABLE],
    ["nome mancante", { name: "   " }, "Inserisci nome e cognome."],
    [
      "nome troppo lungo",
      { name: "a".repeat(101) },
      "Il nome può avere al massimo 100 caratteri.",
    ],
    [
      "password debole",
      { password: "debole", confirmPassword: "debole" },
      null,
    ],
    [
      "password diverse",
      { confirmPassword: "Secure#99y" },
      "Le password non coincidono.",
    ],
    [
      "termini non accettati",
      { termsAccepted: null },
      "Devi accettare i Termini, le Condizioni per i collaboratori e la Privacy Policy.",
    ],
    [
      "clausole non accettate",
      { specificClausesAccepted: null },
      "Devi accettare specificamente le clausole indicate.",
    ],
  ])("%s: rifiutato prima del captcha", async (_label, overrides, message) => {
    const result = await acceptCollaboratorInvite(acceptForm(overrides));

    if (message) expect(result.error).toBe(message);
    else expect(result.error).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockFindInviteByToken).not.toHaveBeenCalled();
  });

  it("oltre il rate limit non legge l'invito", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false, remaining: 0 });

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBeDefined();
    expect(mockFindInviteByToken).not.toHaveBeenCalled();
  });

  it.each([
    ["inesistente o già usato", null],
    ["scaduto", { ...INVITE, expiresAt: new Date(Date.now() - 60 * 1000) }],
  ])("un invito %s non crea nulla", async (_label, invite) => {
    mockFindInviteByToken.mockResolvedValue(invite);

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(UNAVAILABLE);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("degrada se l'invito non si legge", async () => {
    mockFindInviteByToken.mockRejectedValue(new Error("DB down"));

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(
      "Non siamo riusciti a creare l'accesso. Riprova.",
    );
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("un'email che nel frattempo ha un account manda al login", async () => {
    mockEmailHasAccount.mockResolvedValue(true);

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(mockEmailHasAccount).toHaveBeenCalledWith("anna@example.com");
    expect(result.error).toBe(HAS_ACCOUNT);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("se Supabase ha già quell'email lo dice allo stesso modo", async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422, message: "exists" },
    });

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(HAS_ACCOUNT);
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("un altro errore di Supabase degrada senza scrivere", async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "boom" },
    });

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(
      "Non siamo riusciti a creare l'accesso. Riprova.",
    );
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("se Supabase non risponde degrada senza scrivere", async () => {
    mockCreateUser.mockRejectedValue(new Error("fetch failed"));

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(
      "Non siamo riusciti a creare l'accesso. Riprova.",
    );
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("consuma l'invito per id e token: dopo un reinvio il link vecchio non vale", async () => {
    await acceptCollaboratorInvite(acceptForm());

    expect(mockTxDelete).toHaveBeenCalledTimes(1);
    const { params } = new PgDialect().sqlToQuery(claimWhere.mock.calls[0][0]);
    expect(params).toEqual(
      expect.arrayContaining([INVITE.id, hashInviteToken(TOKEN)]),
    );
  });

  it("se l'invito sparisce prima dell'ultimo passo, cancella l'account appena creato", async () => {
    claimReturning.mockResolvedValue([]);

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(UNAVAILABLE);
    expect(memberValues).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalledWith("collab-auth");
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("se la membership non si scrive, cancella l'account appena creato", async () => {
    memberValues.mockRejectedValue(new Error("DB down"));

    const result = await acceptCollaboratorInvite(acceptForm());

    expect(result.error).toBe(
      "Non siamo riusciti a creare l'accesso. Riprova.",
    );
    expect(mockDeleteUser).toHaveBeenCalledWith("collab-auth");
  });

  it("se l'accesso automatico fallisce, l'account resta e si va al login", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { status: 500, message: "boom" },
    });

    await expect(acceptCollaboratorInvite(acceptForm())).rejects.toMatchObject({
      url: "/login",
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
