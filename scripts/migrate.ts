import { readdir, readFile } from "fs/promises";
import path from "path";
import { resolve4, resolve6 } from "dns/promises";
import postgres from "postgres";

// postgres.js v3 tries ALL resolved addresses (IPv4 + IPv6) in order.
// On VPSes without IPv6 routing, AAAA records cause ENETUNREACH before
// the IPv4 attempt. We resolve to IPv4 explicitly to skip that.
// If the host has no A records, we check for AAAA records: an IPv6-only
// host on a VPS without IPv6 routing would fail silently with a cryptic
// ENETUNREACH inside Drizzle. Instead we throw a clear, actionable error.
export async function toIPv4Url(connectionString: string): Promise<string> {
  const url = new URL(connectionString);
  try {
    const [ipv4] = await resolve4(url.hostname);
    url.hostname = ipv4;
    return url.toString();
  } catch {
    // Check whether the host is IPv6-only (has AAAA records but no A records)
    try {
      await resolve6(url.hostname);
      // resolve6 succeeded → the host only has IPv6 records
      throw new Error(
        `Host "${url.hostname}" only has IPv6 (AAAA) records and your server has no IPv6 routing.\n` +
          `Use the Supabase Session Pooler URL instead:\n` +
          `  DATABASE_URL_DIRECT=postgresql://USER:PASS@aws-0-REGION.pooler.supabase.com:5432/postgres\n` +
          `Find it in: Supabase Dashboard → Settings → Database → Connection string → Session pooler`,
      );
    } catch (innerErr) {
      // Re-throw our own IPv6-guidance error
      if ((innerErr as Error).message.includes("IPv6")) throw innerErr;
      // resolve6 also failed — fall back to the original hostname
      console.warn(
        `DNS resolution failed for ${url.hostname}, using original hostname`,
      );
      return connectionString;
    }
  }
}

export async function runMigrations() {
  if (process.env.SKIP_MIGRATIONS === "true") {
    console.log("SKIP_MIGRATIONS=true — skipping DB migrations.");
    return;
  }

  const connectionString =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_DIRECT or DATABASE_URL must be set");
  }

  const resolvedUrl = await toIPv4Url(connectionString);
  const sql = postgres(resolvedUrl, { max: 1 });

  try {
    // Ensure tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS __applied_migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Fetch already-applied filenames
    const rows = await sql<{ filename: string }[]>`
      SELECT filename FROM __applied_migrations ORDER BY filename
    `;
    const applied = new Set(rows.map((r) => r.filename));

    // Collect .sql files sorted by name
    const migrationsFolder = path.join(process.cwd(), "supabase", "migrations");
    const entries = await readdir(migrationsFolder, { withFileTypes: true });
    const sqlFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".sql"))
      .map((e) => e.name)
      .sort();

    let count = 0;
    for (const filename of sqlFiles) {
      if (applied.has(filename)) continue;
      console.log(`Applying migration: ${filename}`);
      const content = await readFile(
        path.join(migrationsFolder, filename),
        "utf-8",
      );
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx.unsafe(
          "INSERT INTO __applied_migrations (filename) VALUES ($1)",
          [filename],
        );
      });
      count++;
    }

    if (count === 0) {
      console.log("No new migrations to apply.");
    } else {
      console.log(`Migrations completed: ${count} applied.`);
    }
  } finally {
    await sql.end();
  }
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
