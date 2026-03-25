import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkMigrations } from "../../../scripts/check-migrations.mjs";

const { mockReaddir, mockReadFile } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: { readdir: mockReaddir, readFile: mockReadFile },
  readdir: mockReaddir,
  readFile: mockReadFile,
}));

function makeDirents(names: string[]) {
  return names.map((name) => ({
    name,
    isFile: () => name.endsWith(".sql"),
  }));
}

function makeJournal(tags: string[]) {
  return JSON.stringify({
    version: "7",
    dialect: "postgresql",
    entries: tags.map((tag, idx) => ({
      idx,
      version: "7",
      when: 0,
      tag,
      breakpoints: true,
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkMigrations", () => {
  it("returns ok when all SQL files match journal entries", async () => {
    mockReaddir.mockResolvedValue(
      makeDirents(["0000_initial.sql", "0001_rls.sql"]),
    );
    mockReadFile.mockResolvedValue(makeJournal(["0000_initial", "0001_rls"]));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when SQL file is missing from journal", async () => {
    mockReaddir.mockResolvedValue(
      makeDirents(["0000_initial.sql", "0002_new_feature.sql"]),
    );
    mockReadFile.mockResolvedValue(makeJournal(["0000_initial"]));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("0002_new_feature.sql");
    expect(result.errors[0]).toContain("not registered");
  });

  it("returns error when journal entry has no SQL file", async () => {
    mockReaddir.mockResolvedValue(makeDirents(["0000_initial.sql"]));
    mockReadFile.mockResolvedValue(makeJournal(["0000_initial", "0001_ghost"]));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("0001_ghost");
    expect(result.errors[0]).toContain("no corresponding SQL file");
  });

  it("returns multiple errors when several files and entries are mismatched", async () => {
    mockReaddir.mockResolvedValue(
      makeDirents(["0000_initial.sql", "0002_extra.sql"]),
    );
    mockReadFile.mockResolvedValue(makeJournal(["0000_initial", "0001_ghost"]));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it("returns ok with empty directory and empty journal", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockResolvedValue(makeJournal([]));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when migrations directory cannot be read", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const result = await checkMigrations("/nonexistent");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Cannot read migrations directory");
  });

  it("returns error when journal file cannot be parsed", async () => {
    mockReaddir.mockResolvedValue(makeDirents(["0000_initial.sql"]));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Cannot read or parse journal");
  });

  it("ignores non-SQL files and subdirectories", async () => {
    mockReaddir.mockResolvedValue([
      { name: "0000_initial.sql", isFile: () => true },
      { name: "meta", isFile: () => false },
      { name: "README.md", isFile: () => true },
    ]);
    mockReadFile.mockResolvedValue(makeJournal(["0000_initial"]));

    const result = await checkMigrations("/fake/migrations");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
