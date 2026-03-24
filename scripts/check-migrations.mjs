/**
 * Validates that every SQL file in supabase/migrations/ is registered in
 * meta/_journal.json and vice versa. Exits with code 1 on any mismatch.
 *
 * Run: node scripts/check-migrations.mjs
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";

/**
 * @param {string} migrationsDir  Absolute path to supabase/migrations/
 * @returns {Promise<{ ok: boolean; errors: string[] }>}
 */
export async function checkMigrations(migrationsDir) {
  const errors = [];

  // 1. Collect all .sql files (top-level only, skip meta/ subfolder)
  let allEntries;
  try {
    allEntries = await readdir(migrationsDir, { withFileTypes: true });
  } catch {
    return {
      ok: false,
      errors: [`Cannot read migrations directory: ${migrationsDir}`],
    };
  }

  const sqlFiles = allEntries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name.replace(/\.sql$/, ""))
    .sort();

  // 2. Read journal
  const journalPath = join(migrationsDir, "meta", "_journal.json");
  let journal;
  try {
    const raw = await readFile(journalPath, "utf-8");
    journal = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: [`Cannot read or parse journal: ${journalPath}`],
    };
  }

  const journalTags = (journal.entries ?? []).map((e) => e.tag).sort();

  // 3. SQL files missing from journal
  for (const tag of sqlFiles) {
    if (!journalTags.includes(tag)) {
      errors.push(
        `Migration file "${tag}.sql" is not registered in _journal.json`,
      );
    }
  }

  // 4. Journal entries without SQL file
  for (const tag of journalTags) {
    if (!sqlFiles.includes(tag)) {
      errors.push(
        `Journal entry "${tag}" has no corresponding SQL file in migrations/`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// Run when executed directly (not when imported in tests)
const isMain = process.argv[1]?.endsWith("check-migrations.mjs") === true;
if (isMain) {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  checkMigrations(migrationsDir).then((result) => {
    if (!result.ok) {
      console.error("❌ Migration journal check failed:");
      for (const err of result.errors) {
        console.error(`   - ${err}`);
      }
      console.error(
        "\nFix: run `npm run db:generate` or update supabase/migrations/meta/_journal.json manually.",
      );
      process.exit(1);
    }
    console.log(
      "✅ Migration journal check passed: all SQL files are registered.",
    );
  });
}
