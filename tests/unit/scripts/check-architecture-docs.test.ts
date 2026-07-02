import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkArchitectureDocs,
  extractFrontmatterPathTokens,
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
 */
function setup(
  files: Record<string, string>,
  existing: string[],
  skills: Record<string, string | null> = {},
) {
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
