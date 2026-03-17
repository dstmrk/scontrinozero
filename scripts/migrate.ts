import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

async function runMigrations() {
  const connectionString =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_DIRECT or DATABASE_URL must be set");
  }

  const sql = postgres(connectionString, { max: 1 });
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
