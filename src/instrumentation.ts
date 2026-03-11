export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");

    const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL_DIRECT or DATABASE_URL is required to run migrations",
      );
    }

    // max: 1 — dedicated connection just for migrations
    // prepare: false — required for Supabase transaction pooler (harmless for direct)
    const client = postgres(url, { max: 1, prepare: false });
    const db = drizzle({ client });

    await migrate(db, { migrationsFolder: "./supabase/migrations" });
    await client.end();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
