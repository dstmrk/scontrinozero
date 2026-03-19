export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");

    const rawUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error(
        "DATABASE_URL_DIRECT or DATABASE_URL is required to run migrations",
      );
    }

    // postgres.js v3 tries ALL resolved addresses (IPv4 + IPv6) in order.
    // On VPSes without IPv6 routing, AAAA records cause ENETUNREACH before
    // the IPv4 attempt. We resolve to IPv4 explicitly to skip that.
    const { resolve4 } = await import("dns/promises");
    const parsed = new URL(rawUrl);
    const [ipv4] = await resolve4(parsed.hostname);
    parsed.hostname = ipv4;
    const url = parsed.toString();

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
