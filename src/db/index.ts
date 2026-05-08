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
    // Required for Supabase transaction pooler — prepared statements are
    // unsupported there because every transaction can land on a different
    // backend connection.
    prepare: false,
    // Cap the pool to avoid exhausting Supabase free-tier connection limits
    // (default 60 inbound). 10 sockets × N container instances must stay
    // well under that ceiling. Bump only after observing saturation in logs.
    max: 10,
    // Surface "DB unreachable" within ~10s instead of letting requests hang
    // on TCP connect — the API route can return a 5xx fast and let the
    // orchestrator decide whether to take this instance out of rotation.
    connect_timeout: 10,
    // Reclaim sockets that have been idle ≥ 30s. Keeps the pool small under
    // bursty traffic without paying the connect cost on every request.
    idle_timeout: 30,
  });

  cachedDb = drizzle({ client, schema });

  return cachedDb;
}
