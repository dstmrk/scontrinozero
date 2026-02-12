import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cachedDb: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required.");
  }

  const client = postgres(databaseUrl, {
    prepare: false, // Required for Supabase transaction pooler
  });

  cachedDb = drizzle({ client, schema });

  return cachedDb;
}
