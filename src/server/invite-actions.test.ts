// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwner,
  mockGetPlanSafe,
  mockEmailHasAccount,
  mockCountTeamSeats,
  mockSendEmail,
  mockRateLimiterCheck,
  mockRevalidatePath,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockDelete,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwner: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockEmailHasAccount: vi.fn(),
  mockCountTeamSeats: vi.fn(),
  mockSendEmail: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));
vi.mock("@/lib/business-permissions", () => ({
  checkBusinessOwner: mockCheckBusinessOwner,
}));
vi.mock("@/lib/plans", () => ({ getPlanSafe: mockGetPlanSafe }));
vi.mock("@/lib/collaborator-invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/collaborator-invites")>()),
  emailHasAccount: mockEmailHasAccount,
  countTeamSeats: mockCountTeamSeats,
}));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { DAILY: 24 * 60 * 60 * 1000 },
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/db", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }),
}));

import { UnauthenticatedError } from "@/lib/auth-errors";
import {
  CURRENT_COLLABORATOR_TERMS_VERSION,
  hashInviteToken,
  INVITE_TTL_MS,
} from "@/lib/collaborator-invites";
import {
  acceptCollaboratorTerms,
  inviteCollaborator,
  revokeCollaboratorInvite,
} from "./invite-actions";

const BIZ = "11111111-1111-4111-8111-111111111111";
const INVITE_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = { memberId: "owner-member", role: "owner" as const };
const OWNER_ONLY_MESSAGE =
  "Questa operazione è riservata al titolare dell'attività.";

type InviteContext = {
  ownerEmail: string;
  collaboratorTermsVersion: string | null;
  businessName: string | null;
  loginMethod: string | null;
  verifiedAt: Date | null;
};

const READY: InviteContext = {
  ownerEmail: "titolare@example.com",
  collaboratorTermsVersion: CURRENT_COLLABORATOR_TERMS_VERSION,
  businessName: "Bar Centrale",
  loginMethod: "fisconline",
  verifiedAt: new Date("2026-10-01T10:00:00Z"),
};

function contextQuery(context: InviteContext | undefined) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(context ? [context] : []),
  };
  return chain;
}

let insertValues: ReturnType<typeof vi.fn>;
let insertConflict: ReturnType<typeof vi.fn>;
let deleteWhere: ReturnType<typeof vi.fn>;
let updateSet: ReturnType<typeof vi.fn>;

function plan(planName: string, trialStartedAt: Date | null = null) {
  return {
    ok: true,
    info: { plan: planName, trialStartedAt, planExpiresAt: null },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "owner-auth" });
  mockCheckBusinessOwner.mockResolvedValue(OWNER);
  mockGetPlanSafe.mockResolvedValue(plan("team"));
  mockEmailHasAccount.mockResolvedValue(false);
  mockCountTeamSeats.mockResolvedValue({ members: 0, openInvites: 0 });
  mockSendEmail.mockResolvedValue(undefined);
  mockRateLimiterCheck.mockReturnValue({ success: true, remaining: 19 });
  mockSelect.mockReturnValue(contextQuery(READY));

  insertConflict = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([{ id: INVITE_ID }]),
  }));
  insertValues = vi.fn(() => ({ onConflictDoUpdate: insertConflict }));
  mockInsert.mockReturnValue({ values: insertValues });

  deleteWhere = vi.fn().mockResolvedValue(undefined);
  mockDelete.mockReturnValue({ where: deleteWhere });

  updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  mockUpdate.mockReturnValue({ set: updateSet });
});

describe("guard comuni", () => {
  it.each([
    ["acceptCollaboratorTerms", () => acceptCollaboratorTerms(BIZ)],
    ["inviteCollaborator", () => inviteCollaborator(BIZ, "anna@example.com")],
    [
      "revokeCollaboratorInvite",
      () => revokeCollaboratorInvite(BIZ, INVITE_ID),
    ],
  ])("%s: senza sessione risponde Non autenticato", async (_name, call) => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    await expect(call()).resolves.toEqual({ error: "Non autenticato." });
  });

  it.each([
    ["acceptCollaboratorTerms", () => acceptCollaboratorTerms("x")],
    ["inviteCollaborator", () => inviteCollaborator("x", "anna@example.com")],
    [
      "revokeCollaboratorInvite",
      () => revokeCollaboratorInvite("x", INVITE_ID),
    ],
  ])("%s: un businessId malformato non arriva al DB", async (_name, call) => {
    await expect(call()).resolves.toEqual({
      error: "Identificativo non valido.",
    });
    expect(mockCheckBusinessOwner).not.toHaveBeenCalled();
  });

  it.each([
    ["acceptCollaboratorTerms", () => acceptCollaboratorTerms(BIZ)],
    ["inviteCollaborator", () => inviteCollaborator(BIZ, "anna@example.com")],
    [
      "revokeCollaboratorInvite",
      () => revokeCollaboratorInvite(BIZ, INVITE_ID),
    ],
  ])("%s: un collaboratore non passa", async (_name, call) => {
    mockCheckBusinessOwner.mockResolvedValue({ error: OWNER_ONLY_MESSAGE });

    await expect(call()).resolves.toEqual({ error: OWNER_ONLY_MESSAGE });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("acceptCollaboratorTerms", () => {
  it("registra la versione corrente delle condizioni sul profilo del titolare", async () => {
    await expect(acceptCollaboratorTerms(BIZ)).resolves.toEqual({});

    expect(updateSet).toHaveBeenCalledWith({
      collaboratorTermsVersion: CURRENT_COLLABORATOR_TERMS_VERSION,
      collaboratorTermsAcceptedAt: expect.any(Date),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
  });
});

describe("inviteCollaborator", () => {
  it("salva l'hash del token e manda il link con il token in chiaro", async () => {
    const before = Date.now();

    await expect(
      inviteCollaborator(BIZ, "  Anna@Example.com "),
    ).resolves.toEqual({});

    const values = insertValues.mock.calls[0][0];
    expect(values).toMatchObject({
      businessId: BIZ,
      email: "anna@example.com",
    });
    expect(values.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + INVITE_TTL_MS,
    );

    const email = mockSendEmail.mock.calls[0][0];
    expect(email.to).toBe("anna@example.com");
    expect(email.subject).toContain("Bar Centrale");
    const { acceptLink } = email.react.props;
    const token = acceptLink.split("/invito/")[1];
    expect(hashInviteToken(token)).toBe(values.tokenHash);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("reinviare la stessa email sostituisce token e scadenza", async () => {
    await inviteCollaborator(BIZ, "anna@example.com");

    const conflict = insertConflict.mock.calls[0][0];
    expect(conflict.set).toEqual({
      tokenHash: insertValues.mock.calls[0][0].tokenHash,
      expiresAt: insertValues.mock.calls[0][0].expiresAt,
      createdAt: expect.any(Date),
    });
  });

  it("rifiuta un'email malformata prima di consumare la quota", async () => {
    await expect(inviteCollaborator(BIZ, "anna@")).resolves.toEqual({
      error: "Email non valida.",
    });
    expect(mockRateLimiterCheck).not.toHaveBeenCalled();
  });

  it("oltre il limite giornaliero non legge e non invia nulla", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false, remaining: 0 });

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toContain("24 ore");
    expect(mockRateLimiterCheck).toHaveBeenCalledWith(`invite:${BIZ}`);
    expect(mockEmailHasAccount).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("degrada se il piano non si legge", async () => {
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "DB lento." });

    await expect(inviteCollaborator(BIZ, "anna@example.com")).resolves.toEqual({
      error: "DB lento.",
    });
  });

  it.each(["starter", "pro"])("il piano %s non invita", async (planName) => {
    mockGetPlanSafe.mockResolvedValue(plan(planName));

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toBe("Il piano attuale non include i collaboratori.");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("senza le condizioni accettate non invita", async () => {
    mockSelect.mockReturnValue(
      contextQuery({ ...READY, collaboratorTermsVersion: null }),
    );

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toBe(
      "Accetta prima le Condizioni per i collaboratori.",
    );
  });

  it("una versione vecchia delle condizioni va riaccettata", async () => {
    mockSelect.mockReturnValue(
      contextQuery({ ...READY, collaboratorTermsVersion: "v00" }),
    );

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toBe(
      "Accetta prima le Condizioni per i collaboratori.",
    );
  });

  it.each([
    ["con CIE", { loginMethod: "cie" }],
    ["con SPID", { loginMethod: "spid" }],
    ["con Fisconline non verificate", { verifiedAt: null }],
    ["senza credenziali", { loginMethod: null, verifiedAt: null }],
  ])("%s non invita", async (_label, override) => {
    mockSelect.mockReturnValue(contextQuery({ ...READY, ...override }));

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toBe(
      "Per invitare collaboratori servono credenziali Fisconline verificate.",
    );
  });

  it("non invita il titolare stesso", async () => {
    const result = await inviteCollaborator(BIZ, "Titolare@example.com");

    expect(result.error).toBe("È la tua email: invita un'altra persona.");
  });

  it("rifiuta un'email che ha già un account", async () => {
    mockEmailHasAccount.mockResolvedValue(true);

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(mockEmailHasAccount).toHaveBeenCalledWith("anna@example.com");
    expect(result.error).toBe(
      "Questa email ha già un account ScontrinoZero: una persona può far parte di una sola attività.",
    );
  });

  it("con 10 inviti in sospeso non ne manda un undicesimo", async () => {
    mockCountTeamSeats.mockResolvedValue({ members: 0, openInvites: 10 });

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(mockCountTeamSeats).toHaveBeenCalledWith(BIZ, "anna@example.com");
    expect(result.error).toContain("10 inviti in sospeso");
  });

  describe("prova", () => {
    const trialStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    beforeEach(() => {
      mockGetPlanSafe.mockResolvedValue(plan("trial", trialStart));
    });

    it("ammette il secondo collaboratore", async () => {
      mockCountTeamSeats.mockResolvedValue({ members: 1, openInvites: 0 });

      await expect(
        inviteCollaborator(BIZ, "anna@example.com"),
      ).resolves.toEqual({});
    });

    it("al terzo, inviti in sospeso compresi, rimanda a Team", async () => {
      mockCountTeamSeats.mockResolvedValue({ members: 1, openInvites: 1 });

      const result = await inviteCollaborator(BIZ, "anna@example.com");

      expect(result.error).toBe(
        "Durante la prova puoi avere fino a 2 collaboratori, inviti in sospeso compresi. Con Team sono illimitati.",
      );
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("una prova scaduta non invita", async () => {
      mockGetPlanSafe.mockResolvedValue(
        plan("trial", new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)),
      );

      const result = await inviteCollaborator(BIZ, "anna@example.com");

      expect(result.error).toBe(
        "Il piano attuale non include i collaboratori.",
      );
    });
  });

  it("Team non ha un tetto di collaboratori", async () => {
    mockCountTeamSeats.mockResolvedValue({ members: 40, openInvites: 9 });

    await expect(inviteCollaborator(BIZ, "anna@example.com")).resolves.toEqual(
      {},
    );
  });

  it("se l'email non parte, l'invito non resta valido", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toBe(
      "Non siamo riusciti a inviare l'email di invito. Riprova tra qualche minuto.",
    );
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("se anche la pulizia fallisce risponde comunque con l'errore", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend down"));
    deleteWhere.mockRejectedValue(new Error("DB down"));

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toContain("Non siamo riusciti");
  });

  it("senza nome dell'attività l'oggetto resta leggibile", async () => {
    mockSelect.mockReturnValue(contextQuery({ ...READY, businessName: null }));

    await inviteCollaborator(BIZ, "anna@example.com");

    expect(mockSendEmail.mock.calls[0][0].subject).toBe(
      "Invito a collaborare su ScontrinoZero",
    );
  });

  it("degrada se l'attività non si trova", async () => {
    mockSelect.mockReturnValue(contextQuery(undefined));

    const result = await inviteCollaborator(BIZ, "anna@example.com");

    expect(result.error).toBe("Business non trovato o non autorizzato.");
  });
});

describe("revokeCollaboratorInvite", () => {
  it("cancella l'invito dell'attività", async () => {
    await expect(revokeCollaboratorInvite(BIZ, INVITE_ID)).resolves.toEqual({});

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("un id d'invito malformato non arriva al DB", async () => {
    await expect(revokeCollaboratorInvite(BIZ, "x")).resolves.toEqual({
      error: "Identificativo non valido.",
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
