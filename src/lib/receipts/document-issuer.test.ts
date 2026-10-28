// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => ({ select: mockSelect }) }));

import {
  API_ISSUER,
  describeIssuer,
  issuerCondition,
  listIssuerOptions,
} from "./document-issuer";

const BIZ = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

function selectReturning(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

const dialect = new PgDialect();
const toSql = (condition: SQL) => dialect.sqlToQuery(condition);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("describeIssuer", () => {
  it("un documento senza membro viene dalla Developer API", () => {
    expect(
      describeIssuer({
        issuerRole: null,
        issuerName: null,
        issuerAuthUserId: null,
      }),
    ).toEqual({ kind: "api", label: "Developer API" });
  });

  it("il titolare è il titolare, anche se la riga ha un nome", () => {
    expect(
      describeIssuer({
        issuerRole: "owner",
        issuerName: "Marta",
        issuerAuthUserId: "u1",
      }),
    ).toEqual({ kind: "owner", label: "Titolare" });
  });

  it("un collaboratore porta il suo nome", () => {
    expect(
      describeIssuer({
        issuerRole: "collaborator",
        issuerName: "Luca",
        issuerAuthUserId: "u2",
      }),
    ).toEqual({ kind: "collaborator", label: "Luca" });
  });

  it("un collaboratore rimosso resta riconoscibile", () => {
    expect(
      describeIssuer({
        issuerRole: "collaborator",
        issuerName: "Luca",
        issuerAuthUserId: null,
      }),
    ).toEqual({ kind: "collaborator", label: "Luca (rimosso)" });
  });

  it("un collaboratore senza nome non lascia l'etichetta vuota", () => {
    expect(
      describeIssuer({
        issuerRole: "collaborator",
        issuerName: "  ",
        issuerAuthUserId: "u3",
      }),
    ).toEqual({ kind: "collaborator", label: "Collaboratore" });
  });
});

describe("issuerCondition", () => {
  it("nessun filtro, nessuna condizione", () => {
    expect(issuerCondition(undefined)).toBeNull();
    expect(issuerCondition("")).toBeNull();
  });

  it("la Developer API sono i documenti senza membro", () => {
    const condition = issuerCondition(API_ISSUER);
    expect(condition).not.toBeNull();
    expect(toSql(condition as SQL).sql).toMatch(/"created_by" is null/);
  });

  it("un membro filtra sul suo id", () => {
    const condition = issuerCondition(MEMBER);
    const query = toSql(condition as SQL);
    expect(query.sql).toMatch(/"created_by" = \$1/);
    expect(query.params).toEqual([MEMBER]);
  });

  it.each([["titolare"], ["not-a-uuid"], ["api "]])(
    "rifiuta un valore estraneo (%s) invece di passarlo a Postgres",
    (value) => {
      expect(issuerCondition(value)).toEqual({
        error: "Filtro «Emesso da» non valido.",
      });
    },
  );
});

describe("listIssuerOptions", () => {
  it("senza collaboratori il filtro non serve", async () => {
    mockSelect.mockReturnValue(
      selectReturning([
        {
          id: "owner-id",
          issuerRole: "owner",
          issuerName: null,
          issuerAuthUserId: "u1",
        },
      ]),
    );

    await expect(listIssuerOptions(BIZ)).resolves.toEqual([]);
  });

  it("titolare, collaboratori (rimossi compresi) e Developer API", async () => {
    mockSelect.mockReturnValue(
      selectReturning([
        {
          id: "c1",
          issuerRole: "collaborator",
          issuerName: "Luca",
          issuerAuthUserId: "u2",
        },
        {
          id: "owner-id",
          issuerRole: "owner",
          issuerName: null,
          issuerAuthUserId: "u1",
        },
        {
          id: "c2",
          issuerRole: "collaborator",
          issuerName: "Sara",
          issuerAuthUserId: null,
        },
      ]),
    );

    await expect(listIssuerOptions(BIZ)).resolves.toEqual([
      { value: "owner-id", label: "Titolare" },
      { value: "c1", label: "Luca" },
      { value: "c2", label: "Sara (rimosso)" },
      { value: API_ISSUER, label: "Developer API" },
    ]);
  });

  it("una lettura fallita degrada a nessun filtro", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockRejectedValue(new Error("db down")),
        })),
      })),
    });

    await expect(listIssuerOptions(BIZ)).resolves.toEqual([]);
  });
});
