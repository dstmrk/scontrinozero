import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkArchitectureDocs,
  extractFrontmatterPathTokens,
  extractHarViolations,
  extractSkillReferences,
} from "../../../scripts/check-architecture-docs.mjs";

const { mockReaddir, mockReadFile, mockStat } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: { readdir: mockReaddir, readFile: mockReadFile, stat: mockStat },
  readdir: mockReaddir,
  readFile: mockReadFile,
  stat: mockStat,
}));

function makeMdDirents(names: string[]) {
  return names.map((name) => ({
    name,
    isFile: () => name.endsWith(".md"),
    isDirectory: () => false,
  }));
}

function makeDirDirents(names: string[]) {
  return names.map((name) => ({
    name,
    isFile: () => false,
    isDirectory: () => true,
  }));
}

/**
 * Wires mockReadFile to serve per-file markdown content and mockStat to resolve
 * only for the paths listed in `existing` (relative to the fake root /repo).
 * `skills` maps a skill dir name to its SKILL.md content (null = unreadable).
 * `claudeMd` is the root CLAUDE.md content (scanned too; null = unreadable).
 *
 * When `claudeMd` is omitted the fixture CLAUDE.md lists every skill as a code
 * span — the shape the real CLAUDE.md has — so the orphan-skill check stays
 * satisfied and tests can assert on the error they actually care about.
 */
function setup(
  files: Record<string, string>,
  existing: string[],
  skills: Record<string, string | null> = {},
  claudeMd: string | null | undefined = undefined,
) {
  const resolvedClaudeMd =
    claudeMd === undefined
      ? Object.keys(skills)
          .map((n) => `- \`${n}\``)
          .join("\n")
      : claudeMd;
  const existingSet = new Set(existing.map((p) => `/repo/${p}`));
  mockReaddir.mockImplementation((p: string) => {
    if (p === "/repo/docs/architecture") {
      return Promise.resolve(makeMdDirents(Object.keys(files)));
    }
    if (p === "/repo/.claude/skills") {
      const names = Object.keys(skills);
      if (names.length === 0) {
        return Promise.reject(new Error(`ENOENT: ${p}`));
      }
      return Promise.resolve(makeDirDirents(names));
    }
    return Promise.reject(new Error(`ENOENT: ${p}`));
  });
  mockReadFile.mockImplementation((p: string) => {
    if (p === "/repo/CLAUDE.md") {
      if (typeof resolvedClaudeMd === "string") {
        return Promise.resolve(resolvedClaudeMd);
      }
      return Promise.reject(new Error(`ENOENT: ${p}`));
    }
    const skillMatch = /^\/repo\/\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(p);
    if (skillMatch) {
      const content = skills[skillMatch[1]];
      if (typeof content === "string") return Promise.resolve(content);
      return Promise.reject(new Error(`ENOENT: ${p}`));
    }
    const name = p.split("/").pop() as string;
    if (name in files) return Promise.resolve(files[name]);
    return Promise.reject(new Error(`ENOENT: ${p}`));
  });
  mockStat.mockImplementation((p: string) => {
    if (existingSet.has(p)) return Promise.resolve({});
    return Promise.reject(new Error(`ENOENT: ${p}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkArchitectureDocs", () => {
  it("returns ok when every referenced path exists", async () => {
    setup(
      {
        "INDEX.md": "Auth lives in `src/lib/server-auth.ts` and `src/server/`.",
      },
      ["src/lib/server-auth.ts", "src/server"],
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns an error when a referenced path does not exist", async () => {
    setup(
      { "INDEX.md": "See `src/lib/ghost.ts` for details." },
      [], // nothing exists
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/lib/ghost.ts");
    expect(result.errors[0]).toContain("INDEX.md");
  });

  it("strips a trailing :lineNumber before checking existence", async () => {
    setup({ "INDEX.md": "Bound at `src/lib/server-auth.ts:51`." }, [
      "src/lib/server-auth.ts",
    ]);

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("skips glob and brace-expansion tokens", async () => {
    setup(
      {
        "INDEX.md":
          "Handlers in `src/app/api/v1/*` and content in `src/lib/{guide,help}`.",
      },
      [], // neither literal path exists, but both must be skipped
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates route-group parens and [id] dynamic segments as literal dirs", async () => {
    setup(
      {
        "INDEX.md":
          "Pages in `src/app/(marketing)` and `src/app/api/v1/receipts/[id]`.",
      },
      ["src/app/(marketing)", "src/app/api/v1/receipts/[id]"],
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("ignores code spans that are not repo paths", async () => {
    setup(
      {
        "INDEX.md":
          "Call `appHref()`, run `npm run arch:check`, read `getAuthenticatedUser`.",
      },
      [],
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("deduplicates a path referenced in multiple docs and reports the first doc", async () => {
    setup(
      {
        "INDEX.md": "`src/lib/plans.ts`",
        "config-manifest.md": "`src/lib/plans.ts`",
      },
      [], // missing → exactly one error despite two references
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("INDEX.md");
  });

  it("reports multiple distinct missing paths", async () => {
    setup({ "INDEX.md": "`src/lib/a.ts` and `src/lib/b.ts`" }, [
      "src/lib/a.ts",
    ]);

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/lib/b.ts");
  });

  it("returns an error when the architecture docs directory cannot be read", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(
      "Cannot read architecture docs directory",
    );
  });

  it("returns an error when an individual doc cannot be read", async () => {
    mockReaddir.mockResolvedValue(makeMdDirents(["INDEX.md"]));
    mockReadFile.mockRejectedValue(new Error("EACCES"));

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Cannot read architecture doc");
    expect(result.errors[0]).toContain("INDEX.md");
  });

  it("returns an error when no markdown files are present", async () => {
    mockReaddir.mockImplementation((p: string) => {
      if (p === "/repo/docs/architecture") {
        return Promise.resolve(makeMdDirents(["notes.txt"]));
      }
      return Promise.reject(new Error(`ENOENT: ${p}`));
    });

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("No .md files");
  });

  it("stays ok when the skills directory is absent", async () => {
    setup({ "INDEX.md": "`src/lib/plans.ts`" }, ["src/lib/plans.ts"]);

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports a dead code-span path cited in a skill body", async () => {
    setup({ "INDEX.md": "no paths here" }, [], {
      "my-skill":
        "---\nname: my-skill\ndescription: x\n---\n\nSee `src/lib/ghost.ts`.",
    });

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/lib/ghost.ts");
    expect(result.errors[0]).toContain(".claude/skills/my-skill/SKILL.md");
  });

  it("reports a dead bare path in a skill frontmatter description", async () => {
    setup({ "INDEX.md": "no paths here" }, ["src/lib/real.ts"], {
      "my-skill":
        "---\nname: my-skill\ndescription: Use when editing files under src/server/ghost/ or src/lib/real.ts.\n---\n\n# body without paths\n",
    });

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/server/ghost");
    expect(result.errors[0]).toContain(".claude/skills/my-skill/SKILL.md");
  });

  it("returns an error when a skill dir has no readable SKILL.md", async () => {
    setup({ "INDEX.md": "no paths here" }, [], { broken: null });

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Cannot read skill doc");
    expect(result.errors[0]).toContain(".claude/skills/broken/SKILL.md");
  });

  it("scans CLAUDE.md and reports a dead path cited there", async () => {
    setup(
      { "INDEX.md": "no paths here" },
      [],
      {},
      "Regola: usa `src/lib/ghost.ts` come helper.",
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/lib/ghost.ts");
    expect(result.errors[0]).toContain("CLAUDE.md");
  });

  it("returns an error when CLAUDE.md is unreadable", async () => {
    setup({ "INDEX.md": "no paths here" }, [], {}, null);

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Cannot read CLAUDE.md");
  });

  it("strips a trailing :from-to line range before checking existence", async () => {
    setup({ "INDEX.md": "Vedi `src/lib/plans.ts:94-106`." }, [
      "src/lib/plans.ts",
    ]);

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects har/ code spans in any scanned doc even though the prefix is not validated", async () => {
    setup(
      {
        "data-flows.md": "Interroga searchDocuments (HAR: `har/ricerca.har`).",
      },
      [],
      {
        "my-skill":
          "---\nname: my-skill\ndescription: x\n---\n\nCattura `har/login_cie.har`.",
      },
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("har/ricerca.har");
    expect(result.errors[0]).toContain("docs/architecture/data-flows.md");
    expect(result.errors[0]).toContain("cite the bare filename");
    expect(result.errors[1]).toContain("har/login_cie.har");
    expect(result.errors[1]).toContain(".claude/skills/my-skill/SKILL.md");
  });

  it("validates .claude/ code spans and reports a dead hook path", async () => {
    setup(
      { "INDEX.md": "no paths here" },
      [".claude/hooks/block-push-to-main.sh"],
      {},
      "Hook: `.claude/hooks/block-push-to-main.sh` e `.claude/hooks/ghost.sh`.",
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(".claude/hooks/ghost.sh");
    expect(result.errors[0]).toContain("CLAUDE.md");
  });

  it("reports a `skill \\`name\\`` citation that matches no skill directory", async () => {
    setup(
      { "INDEX.md": "Soglia descritta nella skill `stripe-webhooks`." },
      [],
      { "ade-integration": "---\nname: ade-integration\n---\n" },
      "- `ade-integration`",
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("stripe-webhooks");
    expect(result.errors[0]).toContain("docs/architecture/INDEX.md");
  });

  it("accepts a skill citation that resolves to an existing skill directory", async () => {
    setup({ "INDEX.md": "Dettaglio nella skill `ade-integration`." }, [], {
      "ade-integration": "---\nname: ade-integration\n---\n",
    });

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports a skill that no index doc ever cites (orphan skill)", async () => {
    setup(
      { "INDEX.md": "no skills cited here" },
      [],
      { "lonely-skill": "---\nname: lonely-skill\n---\n" },
      "CLAUDE.md senza elenco skill.",
    );

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("lonely-skill");
    expect(result.errors[0]).toContain("never cited");
  });

  it("counts a bare code-span mention in docs/architecture as citing the skill", async () => {
    setup({ "INDEX.md": "Prescrittivo: `lonely-skill`." }, [], {
      "lonely-skill": "---\nname: lonely-skill\n---\n",
    });

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("does not flag an unreadable skill as an orphan on top of the read error", async () => {
    setup({ "INDEX.md": "no skills cited here" }, [], { broken: null }, "");

    const result = await checkArchitectureDocs("/repo");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Cannot read skill doc");
  });
});

describe("extractSkillReferences", () => {
  it("extracts names cited with the `skill <name>` form, singular and plural", () => {
    const md = [
      "Vedi la skill `ade-integration` e le skills `db-migrations`.",
      "Procedura → skill `deploy-release` (smoke).",
    ].join("\n");

    expect(extractSkillReferences(md)).toEqual([
      "ade-integration",
      "db-migrations",
      "deploy-release",
    ]);
  });

  it("ignores code spans not preceded by the word skill", () => {
    expect(
      extractSkillReferences("Il file `src/lib/plans.ts` e `getPlan`."),
    ).toEqual([]);
  });

  it("ignores a span that cannot be a skill directory name", () => {
    const md = "skill `Not A Slug` e skill `src/lib/x.ts` e skill `-lead`.";

    expect(extractSkillReferences(md)).toEqual([]);
  });

  it("de-duplicates a skill cited several times", () => {
    const md = "skill `deploy-release` … skill `deploy-release` ancora.";

    expect(extractSkillReferences(md)).toEqual(["deploy-release"]);
  });

  it("matches across a line wrap and regardless of case", () => {
    const md = "Procedura → Skill\n`deploy-release` (smoke post-deploy).";

    expect(extractSkillReferences(md)).toEqual(["deploy-release"]);
  });

  it("ignores a word that merely ends in skill", () => {
    expect(extractSkillReferences("La subskill `deploy-release`.")).toEqual([]);
  });
});

describe("extractHarViolations", () => {
  it("finds har/ spans and ignores bare HAR filenames", () => {
    const md =
      "Usa `har/ricerca.har` ma cita `ricerca.har` e `login_cie.har` così.";

    expect(extractHarViolations(md)).toEqual(["har/ricerca.har"]);
  });

  it("allows the bare har/ directory span", () => {
    expect(extractHarViolations("Le HAR vivono in `har/` in locale.")).toEqual(
      [],
    );
  });

  it("returns an empty list when no har/ span is present", () => {
    expect(extractHarViolations("Solo `src/lib/a.ts` qui.")).toEqual([]);
  });
});

describe("extractFrontmatterPathTokens", () => {
  it("extracts prefixed bare tokens from frontmatter only, normalizing trailing / and .", () => {
    const md = [
      "---",
      "name: x",
      "description: Edit src/lib/ade/ or scripts/migrate.ts. Ignore har/foo.har.",
      "---",
      "",
      "Body mentions src/lib/other.ts as bare text (ignored).",
    ].join("\n");

    expect(extractFrontmatterPathTokens(md)).toEqual([
      "scripts/migrate.ts",
      "src/lib/ade",
    ]);
  });

  it("strips unbalanced closing parens/brackets but keeps balanced segments", () => {
    const md = [
      "---",
      "description: (e.g. appHref() from src/lib/marketing-to-app-href.ts) and pages in src/app/(marketing). Also src/app/api/v1/receipts/[id].",
      "---",
    ].join("\n");

    expect(extractFrontmatterPathTokens(md)).toEqual([
      "src/app/(marketing)",
      "src/app/api/v1/receipts/[id]",
      "src/lib/marketing-to-app-href.ts",
    ]);
  });

  it("returns an empty list when there is no frontmatter", () => {
    expect(extractFrontmatterPathTokens("plain `src/lib/a.ts` text")).toEqual(
      [],
    );
  });
});
