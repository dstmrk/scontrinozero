/**
 * Validates the codebase map under docs/architecture/, the skills under
 * .claude/skills/ AND the root CLAUDE.md: every repo path cited in those docs
 * (as an inline code span; for skills also as a bare token in the frontmatter
 * `description`) must still exist on disk. Catches the most damaging form of
 * drift — a path renamed or deleted while the doc kept the old reference —
 * turning a stale map into a hard CI failure instead of silently misleading
 * the next reader (or steering a skill's auto-activation with a dead path).
 * Exits with code 1 on any dead reference.
 *
 * Run: node scripts/check-architecture-docs.mjs  (npm run arch:check)
 *
 * Validation contract (keep the docs friendly to it):
 *  - Only INLINE code spans are scanned (`` `like/this` ``), not fenced blocks —
 *    so directory trees and shell snippets stay illustrative.
 *  - A span is treated as a repo path iff it starts with one of the known top
 *    dirs (src/, supabase/, scripts/, deploy/, docs/, tests/, public/,
 *    .claude/) and contains only path characters. Write each validated path as
 *    its OWN span.
 *  - A trailing `:NN` or `:NN-MM` line-number/range suffix is stripped before
 *    the check.
 *  - Tokens containing `*`, `{` or `}` (globs / brace expansion) are skipped —
 *    they are intentionally illustrative, not literal paths. Illustrative
 *    placeholder paths (e.g. a migration naming pattern) must use a glob or
 *    plain text, not a literal-looking code span.
 *  - Route-group parens `(marketing)` and dynamic `[id]` segments are literal
 *    directory names on disk, so they validate as-is.
 *  - In .claude/skills/<name>/SKILL.md the YAML frontmatter is additionally
 *    scanned for BARE tokens with a known prefix (descriptions are plain text,
 *    no code spans) — that is where the dead `src/server/ade/` reference lived.
 *  - A code span starting with `har/` is ALWAYS an error: HAR captures are
 *    local-only and gitignored, so the path would never exist in CI. Cite the
 *    bare filename instead (see the ade-integration skill).
 *  - REVIEW.md and PLAN.md are intentionally NOT scanned: they legitimately
 *    cite historical/removed paths in prose, so the false-positive noise
 *    would outweigh the value.
 *
 * Skill cross-references are validated too — a doc that sends the reader to a
 * skill that was renamed or absorbed elsewhere misleads exactly like a dead
 * path, and nothing else catches it:
 *  - Every `` skill `<name>` `` (or `skills `<name>``) citation must resolve to
 *    a directory under .claude/skills/. Only that explicit form is checked, so
 *    ordinary code spans never produce false positives.
 *  - Every skill directory must be cited at least once in CLAUDE.md or
 *    docs/architecture/ — as a plain code span is enough. Keeps the skill list
 *    in CLAUDE.md from silently going stale when a skill is added.
 */

import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

const ARCH_DOCS_SUBDIR = ["docs", "architecture"];
const SKILLS_SUBDIR = [".claude", "skills"];
const PATH_PREFIX_RE =
  /^(?:src|supabase|scripts|deploy|docs|tests|public|\.claude)\//;
const PATH_BODY_RE = /^[A-Za-z0-9_./()[\]-]+$/;
const BARE_PATH_RE =
  /(?:src|supabase|scripts|deploy|docs|tests|public)\/[A-Za-z0-9_./()[\]-]*/g;
/** A skill directory name: lowercase slug, the shape of .claude/skills/<name>. */
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

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
      .replace(/:\d+(?:-\d+)?$/, "") // drop :lineNumber / :from-to suffix
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
 * Extracts every inline code span of a markdown string, trimmed.
 * @param {string} markdown
 * @returns {string[]}
 */
function extractCodeSpans(markdown) {
  const spans = [];
  const spanRe = /`([^`\n]+)`/g;
  let match;
  while ((match = spanRe.exec(markdown)) !== null) {
    spans.push(match[1].trim());
  }
  return spans;
}

/**
 * Extracts the skill names cited with the explicit `` skill `<name>` `` form
 * (singular or plural). Restricting the match to that form keeps ordinary code
 * spans — function names, env vars, paths — from being read as skill
 * references, so the check has no false positives.
 * @param {string} markdown
 * @returns {string[]} sorted, de-duplicated skill names
 */
export function extractSkillReferences(markdown) {
  const names = new Set();
  // `\b` so a word merely ENDING in "skill" is not a citation; `\s+` spans a
  // newline on purpose — the docs wrap at 80 columns and "→ skill\n`x`" is a
  // citation like any other.
  const refRe = /\bskills?\s+`([^`\n]+)`/gi;
  let match;
  while ((match = refRe.exec(markdown)) !== null) {
    const name = match[1].trim();
    if (SKILL_NAME_RE.test(name)) names.add(name);
  }
  return [...names].sort();
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
 * Finds inline code spans that cite HAR captures with a `har/` path prefix.
 * HAR files are local-only and gitignored, so such a span can never validate
 * in CI — the docs must cite the bare filename instead. The bare directory
 * span `har/` is allowed (describing where captures live locally is fine).
 * @param {string} markdown
 * @returns {string[]} sorted, de-duplicated offending spans
 */
export function extractHarViolations(markdown) {
  const violations = new Set();
  const spanRe = /`([^`\n]+)`/g;
  let match;
  while ((match = spanRe.exec(markdown)) !== null) {
    const token = match[1].trim();
    if (/^har\/./.test(token)) violations.add(token);
  }
  return [...violations].sort();
}

/**
 * @param {string} token  Offending `har/...` span
 * @param {string} doc    Display path of the doc citing it
 * @returns {string}
 */
function harError(token, doc) {
  return `HAR reference "${token}" (in ${doc}): HAR files are local-only and gitignored; cite the bare filename (see the ade-integration skill)`;
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
  // skill name -> first doc citing it as `` skill `<name>` `` (must resolve)
  const skillRefs = new Map();
  // every code span seen in CLAUDE.md + docs/architecture/: a skill named here
  // counts as listed, which is what the orphan check looks for.
  const citedInIndexDocs = new Set();
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
    for (const span of extractHarViolations(content)) {
      errors.push(harError(span, `docs/architecture/${file}`));
    }
    for (const name of extractSkillReferences(content)) {
      if (!skillRefs.has(name)) {
        skillRefs.set(name, `docs/architecture/${file}`);
      }
    }
    for (const span of extractCodeSpans(content)) citedInIndexDocs.add(span);
  }

  // CLAUDE.md (repo root) — same code-span contract. Its rules are terse
  // pointers into skills/docs, so a dead path here misleads every session.
  try {
    const content = await readFile(join(rootDir, "CLAUDE.md"), "utf-8");
    for (const token of extractPathTokens(content)) {
      if (!referencedBy.has(token)) referencedBy.set(token, "CLAUDE.md");
    }
    for (const span of extractHarViolations(content)) {
      errors.push(harError(span, "CLAUDE.md"));
    }
    for (const name of extractSkillReferences(content)) {
      if (!skillRefs.has(name)) skillRefs.set(name, "CLAUDE.md");
    }
    for (const span of extractCodeSpans(content)) citedInIndexDocs.add(span);
  } catch {
    errors.push("Cannot read CLAUDE.md at repo root");
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
  const readableSkills = [];
  for (const name of skillNames) {
    const displayPath = `.claude/skills/${name}/SKILL.md`;
    let content;
    try {
      content = await readFile(join(skillsDir, name, "SKILL.md"), "utf-8");
    } catch {
      errors.push(`Cannot read skill doc: ${displayPath}`);
      continue;
    }
    readableSkills.push(name);
    const tokens = [
      ...extractPathTokens(content),
      ...extractFrontmatterPathTokens(content),
    ];
    for (const token of tokens) {
      if (!referencedBy.has(token)) referencedBy.set(token, displayPath);
    }
    for (const span of extractHarViolations(content)) {
      errors.push(harError(span, displayPath));
    }
    for (const refName of extractSkillReferences(content)) {
      if (!skillRefs.has(refName)) skillRefs.set(refName, displayPath);
    }
  }

  // A `` skill `<name>` `` citation pointing at a skill that no longer exists
  // (renamed, merged into another) misroutes the reader exactly like a dead path.
  const skillSet = new Set(skillNames);
  for (const [name, doc] of [...skillRefs].sort()) {
    if (!skillSet.has(name)) {
      errors.push(
        `Skill reference "${name}" (in ${doc}) matches no directory under .claude/skills/`,
      );
    }
  }

  // The reverse drift: a skill nobody lists. CLAUDE.md and the codebase map are
  // how a session discovers which skills exist — a skill missing from both is
  // invisible in practice, even though its description may auto-activate it.
  for (const name of readableSkills) {
    if (!citedInIndexDocs.has(name)) {
      errors.push(
        `Skill "${name}" is never cited in CLAUDE.md or docs/architecture/ — add it to the skill list (CLAUDE.md regola 26)`,
      );
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
        "\nFix: update the stale reference in docs/architecture/, .claude/skills/ or CLAUDE.md (docs must point at real files and real skills).",
      );
      process.exit(1);
    }
    console.log(
      "✅ Architecture docs check passed: referenced paths and skills all exist.",
    );
  });
}
