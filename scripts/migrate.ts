import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { resolve4, resolve6 } from "dns/promises";

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
  const connectionString =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_DIRECT or DATABASE_URL must be set");
  }

  const resolvedUrl = await toIPv4Url(connectionString);
  const sql = postgres(resolvedUrl, { max: 1 });
  const db = drizzle(sql);

  const migrationsFolder = path.join(process.cwd(), "supabase", "migrations");

  console.log("Running DB migrations...");
  await migrate(db, { migrationsFolder });
  console.log("Migrations completed successfully.");

  await sql.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
