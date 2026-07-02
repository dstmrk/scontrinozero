/**
 * Validates the codebase map under docs/architecture/ AND the skills under
 * .claude/skills/: every repo path cited in those docs (as an inline code span;
 * for skills also as a bare token in the frontmatter `description`) must still
 * exist on disk. Catches the most damaging form of drift — a path renamed or
 * deleted while the doc kept the old reference — turning a stale map into a
 * hard CI failure instead of silently misleading the next reader (or steering
 * a skill's auto-activation with a dead path). Exits with code 1 on any dead
 * reference.
 *
 * Run: node scripts/check-architecture-docs.mjs  (npm run arch:check)
 *
 * Validation contract (keep the docs friendly to it):
 *  - Only INLINE code spans are scanned (`` `like/this` ``), not fenced blocks —
 *    so directory trees and shell snippets stay illustrative.
 *  - A span is treated as a repo path iff it starts with one of the known top
 *    dirs (src/, supabase/, scripts/, deploy/, docs/, tests/, public/) and
 *    contains only path characters. Write each validated path as its OWN span.
 *  - A trailing `:NN` line-number suffix is stripped before the check.
 *  - Tokens containing `*`, `{` or `}` (globs / brace expansion) are skipped —
 *    they are intentionally illustrative, not literal paths.
 *  - Route-group parens `(marketing)` and dynamic `[id]` segments are literal
 *    directory names on disk, so they validate as-is.
 *  - In .claude/skills/<name>/SKILL.md the YAML frontmatter is additionally
 *    scanned for BARE tokens with a known prefix (descriptions are plain text,
 *    no code spans) — that is where the dead `src/server/ade/` reference lived.
 */

import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

const ARCH_DOCS_SUBDIR = ["docs", "architecture"];
const SKILLS_SUBDIR = [".claude", "skills"];
const PATH_PREFIX_RE = /^(?:src|supabase|scripts|deploy|docs|tests|public)\//;
const PATH_BODY_RE = /^[A-Za-z0-9_./()[\]-]+$/;
const BARE_PATH_RE =
  /(?:src|supabase|scripts|deploy|docs|tests|public)\/[A-Za-z0-9_./()[\]-]*/g;

/**
 * Extracts the repo paths referenced as inline code spans in a markdown string.
 * @param {string} markdown
 * @returns {string[]} sorted, de-duplicated path tokens
 */
export function extractPathTokens(markdown) {
  const tokens = new Set();
  const spanRe = /`([^`\n]+)`/g;
  let match;
  while ((match = spanRe.exec(markdown)) !== null) {
    let token = match[1]
      .trim()
      .replace(/:\d+$/, "") // drop :lineNumber suffix
      .replace(/\/+$/, ""); // drop trailing slash (dir spans normalize to bare path)
    if (token.includes("*") || token.includes("{") || token.includes("}")) {
      continue; // glob / brace expansion → illustrative, skip
    }
    if (!PATH_PREFIX_RE.test(token) || !PATH_BODY_RE.test(token)) {
      continue; // not a repo path
    }
    tokens.add(token);
  }
  return [...tokens].sort();
}

/**
 * Extracts the repo paths cited as BARE tokens in the YAML frontmatter of a
 * skill markdown (the `description` is plain text, so code-span scanning
 * misses it). Trailing `/` and `.` are stripped: "under src/lib/ade/," and
 * "in scripts/migrate.ts." both cite the path, not the punctuation.
 * @param {string} markdown
 * @returns {string[]} sorted, de-duplicated path tokens
 */
export function extractFrontmatterPathTokens(markdown) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!frontmatter) return [];
  const tokens = new Set();
  let match;
  while ((match = BARE_PATH_RE.exec(frontmatter[1])) !== null) {
    const token = normalizeBareToken(match[0]);
    if (!PATH_PREFIX_RE.test(`${token}/`) || !PATH_BODY_RE.test(token)) {
      continue; // bare prefix with nothing after it, or stray characters
    }
    tokens.add(token);
  }
  return [...tokens].sort();
}

/**
 * Strips trailing punctuation off a bare token: `/` and `.` (sentence
 * boundary), plus UNBALANCED closing `)`/`]` — "(e.g. from src/lib/x.ts)"
 * captures the closing paren, while route-group `(marketing)` and dynamic
 * `[id]` segments are balanced and must survive.
 * @param {string} raw
 * @returns {string}
 */
function normalizeBareToken(raw) {
  let token = raw.replace(/[./]+$/, "");
  const count = (s, ch) => s.split(ch).length - 1;
  while (
    (token.endsWith(")") && count(token, "(") < count(token, ")")) ||
    (token.endsWith("]") && count(token, "[") < count(token, "]"))
  ) {
    token = token.slice(0, -1).replace(/[./]+$/, "");
  }
  return token;
}

/**
 * @param {string} rootDir  Absolute path to the repository root
 * @returns {Promise<{ ok: boolean; errors: string[] }>}
 */
export async function checkArchitectureDocs(rootDir) {
  const errors = [];
  const docsDir = join(rootDir, ...ARCH_DOCS_SUBDIR);

  let entries;
  try {
    entries = await readdir(docsDir, { withFileTypes: true });
  } catch {
    return {
      ok: false,
      errors: [`Cannot read architecture docs directory: ${docsDir}`],
    };
  }

  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();

  if (mdFiles.length === 0) {
    return { ok: false, errors: [`No .md files found in ${docsDir}`] };
  }

  // token -> first doc that referenced it (so the error points somewhere useful)
  const referencedBy = new Map();
  for (const file of mdFiles) {
    let content;
    try {
      content = await readFile(join(docsDir, file), "utf-8");
    } catch {
      errors.push(`Cannot read architecture doc: docs/architecture/${file}`);
      continue;
    }
    for (const token of extractPathTokens(content)) {
      if (!referencedBy.has(token)) {
        referencedBy.set(token, `docs/architecture/${file}`);
      }
    }
  }

  // .claude/skills/<name>/SKILL.md — same code-span contract, plus bare
  // frontmatter tokens. A missing skills dir is fine (nothing to validate);
  // a skill dir without a readable SKILL.md is a broken skill → error.
  const skillsDir = join(rootDir, ...SKILLS_SUBDIR);
  let skillEntries = [];
  try {
    skillEntries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    skillEntries = [];
  }
  const skillNames = skillEntries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of skillNames) {
    const displayPath = `.claude/skills/${name}/SKILL.md`;
    let content;
    try {
      content = await readFile(join(skillsDir, name, "SKILL.md"), "utf-8");
    } catch {
      errors.push(`Cannot read skill doc: ${displayPath}`);
      continue;
    }
    const tokens = [
      ...extractPathTokens(content),
      ...extractFrontmatterPathTokens(content),
    ];
    for (const token of tokens) {
      if (!referencedBy.has(token)) referencedBy.set(token, displayPath);
    }
  }

  const sortedTokens = [...referencedBy.keys()].sort();
  for (const token of sortedTokens) {
    try {
      await stat(join(rootDir, token));
    } catch {
      errors.push(
        `Referenced path "${token}" (in ${referencedBy.get(token)}) does not exist`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// Run when executed directly (not when imported in tests)
const isMain =
  process.argv[1]?.endsWith("check-architecture-docs.mjs") === true;
if (isMain) {
  checkArchitectureDocs(process.cwd()).then((result) => {
    if (!result.ok) {
      console.error("❌ Architecture docs check failed:");
      for (const err of result.errors) {
        console.error(`   - ${err}`);
      }
      console.error(
        "\nFix: update the stale path in docs/architecture/ or .claude/skills/ (docs must point at real files).",
      );
      process.exit(1);
    }
    console.log(
      "✅ Architecture docs check passed: all referenced paths exist.",
    );
  });
}
