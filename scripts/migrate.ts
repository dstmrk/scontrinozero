import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { resolve4 } from "dns/promises";

// postgres.js v3 tries ALL resolved addresses (IPv4 + IPv6) in order.
// On VPSes without IPv6 routing, AAAA records cause ENETUNREACH before
// the IPv4 attempt. We resolve to IPv4 explicitly to skip that.
async function toIPv4Url(connectionString: string): Promise<string> {
  const url = new URL(connectionString);
  const [ipv4] = await resolve4(url.hostname);
  url.hostname = ipv4;
  return url.toString();
}

async function runMigrations() {
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
