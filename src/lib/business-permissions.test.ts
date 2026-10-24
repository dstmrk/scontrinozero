// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckBusinessMembership,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockCheckBusinessMembership: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  checkBusinessMembership: mockCheckBusinessMembership,
}));

vi.mock("@/db", () => ({
  getDb: () => ({ select: mockSelect }),
}));

import {
  COLLABORATORS_SUSPENDED_MESSAGE,
  OWNER_ONLY_MESSAGE,
  canAccessDocument,
  checkBusinessOwner,
  collaboratorSuspendedError,
  isCollaborator,
  ownDocumentsCondition,
} from "./business-permissions";

const OWNER = { memberId: "member-owner", role: "owner" } as const;
const COLLABORATOR = {
  memberId: "member-collab",
  role: "collaborator",
} as const;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
});

/** Rende in SQL la condizione passata al `where` della query. */
function renderedWhere() {
  return new PgDialect().sqlToQuery(mockWhere.mock.calls[0][0]);
}

describe("checkBusinessOwner", () => {
  it("restituisce la membership del titolare", async () => {
    mockCheckBusinessMembership.mockResolvedValue(OWNER);
    await expect(checkBusinessOwner("user-1", "biz-1")).resolves.toEqual(OWNER);
    expect(mockCheckBusinessMembership).toHaveBeenCalledWith("user-1", "biz-1");
  });

  it("rifiuta un collaboratore con il messaggio riservato al titolare", async () => {
    mockCheckBusinessMembership.mockResolvedValue(COLLABORATOR);
    await expect(checkBusinessOwner("user-2", "biz-1")).resolves.toEqual({
      error: OWNER_ONLY_MESSAGE,
    });
  });

  it("passa invariato l'errore di chi non appartiene all'attività", async () => {
    const notMember = { error: "Business non trovato o non autorizzato." };
    mockCheckBusinessMembership.mockResolvedValue(notMember);
    await expect(checkBusinessOwner("user-3", "biz-1")).resolves.toEqual(
      notMember,
    );
  });
});

describe("collaboratorSuspendedError", () => {
  const team = {
    plan: "team",
    trialStartedAt: null,
    planExpiresAt: null,
  } as const;
  const pro = {
    plan: "pro",
    trialStartedAt: null,
    planExpiresAt: null,
  } as const;

  it("il titolare opera qualunque sia il piano", () => {
    expect(collaboratorSuspendedError(OWNER, pro)).toBeNull();
  });

  it("il collaboratore opera se il piano del titolare lo ammette", () => {
    expect(collaboratorSuspendedError(COLLABORATOR, team)).toBeNull();
    expect(
      collaboratorSuspendedError(COLLABORATOR, {
        plan: "trial",
        trialStartedAt: daysAgo(3),
        planExpiresAt: null,
      }),
    ).toBeNull();
  });

  it("il collaboratore è sospeso se il titolare scende a Pro", () => {
    expect(collaboratorSuspendedError(COLLABORATOR, pro)).toBe(
      COLLABORATORS_SUSPENDED_MESSAGE,
    );
  });

  it("il messaggio rimanda al titolare, senza un invito all'acquisto", () => {
    expect(COLLABORATORS_SUSPENDED_MESSAGE).toMatch(/titolare/);
    expect(COLLABORATORS_SUSPENDED_MESSAGE).not.toMatch(
      /attiva|passa a|piano Team/i,
    );
  });
});

describe("ownDocumentsCondition", () => {
  it("non restringe nulla per il titolare", () => {
    expect(ownDocumentsCondition(OWNER)).toBeUndefined();
  });

  it("limita il collaboratore ai documenti che ha creato", () => {
    const condition = ownDocumentsCondition(COLLABORATOR);
    expect(condition).toBeDefined();
    const query = new PgDialect().sqlToQuery(condition!);
    expect(query.sql).toBe('"commercial_documents"."created_by" = $1');
    expect(query.params).toEqual(["member-collab"]);
  });
});

describe("canAccessDocument", () => {
  it("il titolare accede a ogni documento dell'attività senza query", async () => {
    await expect(canAccessDocument(OWNER, "biz-1", "doc-1")).resolves.toBe(
      true,
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("il collaboratore accede a un documento suo", async () => {
    mockLimit.mockResolvedValue([{ id: "doc-1" }]);
    await expect(
      canAccessDocument(COLLABORATOR, "biz-1", "doc-1"),
    ).resolves.toBe(true);
    const { sql, params } = renderedWhere();
    expect(sql).toContain('"commercial_documents"."id" = $1');
    expect(sql).toContain('"commercial_documents"."business_id" = $2');
    expect(sql).toContain('"commercial_documents"."created_by" = $3');
    expect(params).toEqual(["doc-1", "biz-1", "member-collab"]);
  });

  it("il collaboratore non accede al documento di un altro membro", async () => {
    mockLimit.mockResolvedValue([]);
    await expect(
      canAccessDocument(COLLABORATOR, "biz-1", "doc-2"),
    ).resolves.toBe(false);
  });
});

describe("isCollaborator", () => {
  it("true per chi è collaboratore di un'attività", async () => {
    mockLimit.mockResolvedValue([{ role: "collaborator" }]);
    await expect(isCollaborator("user-2")).resolves.toBe(true);
    const { sql, params } = renderedWhere();
    expect(sql).toBe('"business_members"."auth_user_id" = $1');
    expect(params).toEqual(["user-2"]);
  });

  it("false per il titolare e per chi non ha ancora un'attività", async () => {
    mockLimit.mockResolvedValueOnce([{ role: "owner" }]);
    await expect(isCollaborator("user-1")).resolves.toBe(false);
    mockLimit.mockResolvedValueOnce([]);
    await expect(isCollaborator("user-9")).resolves.toBe(false);
  });
});
