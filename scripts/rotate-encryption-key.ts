/**
 * Key rotation script for ade_credentials.
 *
 * Re-encrypts all Fisconline credentials from old ENCRYPTION_KEY to a new one.
 * Run this BEFORE deploying updated env vars to the server.
 *
 * Usage:
 *   npx tsx scripts/rotate-encryption-key.ts \
 *     --old-key  <64 hex chars>  \
 *     --old-version <integer>    \
 *     --new-key  <64 hex chars>  \
 *     --new-version <integer>
 *
 * See CLAUDE.md rule 24 for the full rotation runbook.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { encrypt, decrypt } from "../src/lib/crypto";

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  oldKey: string;
  oldVersion: number;
  newKey: string;
  newVersion: number;
} {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const oldKey = get("--old-key");
  const oldVersionStr = get("--old-version");
  const newKey = get("--new-key");
  const newVersionStr = get("--new-version");

  if (!oldKey || !oldVersionStr || !newKey || !newVersionStr) {
    console.error(
      "Usage: npx tsx scripts/rotate-encryption-key.ts \\\n" +
        "  --old-key <64 hex>  --old-version <int> \\\n" +
        "  --new-key <64 hex>  --new-version <int>",
    );
    process.exit(1);
  }

  if (!/^[0-9a-fA-F]{64}$/.test(oldKey)) {
    console.error("--old-key must be a 64-character hex string");
    process.exit(1);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(newKey)) {
    console.error("--new-key must be a 64-character hex string");
    process.exit(1);
  }

  const oldVersion = parseInt(oldVersionStr, 10);
  const newVersion = parseInt(newVersionStr, 10);

  if (isNaN(oldVersion) || oldVersion < 1 || oldVersion > 255) {
    console.error("--old-version must be an integer between 1 and 255");
    process.exit(1);
  }
  if (isNaN(newVersion) || newVersion < 1 || newVersion > 255) {
    console.error("--new-version must be an integer between 1 and 255");
    process.exit(1);
  }
  if (oldVersion === newVersion) {
    console.error("--old-version and --new-version must differ");
    process.exit(1);
  }

  return { oldKey, oldVersion, newKey, newVersion };
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function rotateEncryptionKey(opts: {
  oldKey: string;
  oldVersion: number;
  newKey: string;
  newVersion: number;
  databaseUrl: string;
}): Promise<{ rotated: number; skipped: number }> {
  const { oldKey, oldVersion, newKey, newVersion, databaseUrl } = opts;

  const oldKeyBuf = Buffer.from(oldKey, "hex");
  const newKeyBuf = Buffer.from(newKey, "hex");

  const client = postgres(databaseUrl, { prepare: false });
  const db = drizzle({ client, schema });

  try {
    const rows = await db
      .select()
      .from(schema.adeCredentials)
      .orderBy(schema.adeCredentials.id);

    console.log(`Found ${rows.length} ade_credentials row(s).`);

    let rotated = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      for (const row of rows) {
        if (row.keyVersion === newVersion) {
          console.log(`  [skip] ${row.id} — already on version ${newVersion}`);
          skipped++;
          continue;
        }

        // Decrypt with old key
        const oldKeys = new Map<number, Buffer>([[oldVersion, oldKeyBuf]]);
        const codiceFiscale = decrypt(row.encryptedCodiceFiscale, oldKeys);
        const password = decrypt(row.encryptedPassword, oldKeys);
        const pin = decrypt(row.encryptedPin, oldKeys);

        // Re-encrypt with new key
        const encryptedCodiceFiscale = encrypt(
          codiceFiscale,
          newKeyBuf,
          newVersion,
        );
        const encryptedPassword = encrypt(password, newKeyBuf, newVersion);
        const encryptedPin = encrypt(pin, newKeyBuf, newVersion);

        await tx
          .update(schema.adeCredentials)
          .set({
            encryptedCodiceFiscale,
            encryptedPassword,
            encryptedPin,
            keyVersion: newVersion,
          })
          .where(eq(schema.adeCredentials.id, row.id));

        console.log(
          `  [ok]   ${row.id} — rotated v${oldVersion} → v${newVersion}`,
        );
        rotated++;
      }
    });

    console.log(
      `\nDone. Rotated: ${rotated}, Skipped (already new version): ${skipped}`,
    );
    return { rotated, skipped };
  } finally {
    await client.end();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("rotate-encryption-key.ts")) {
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  rotateEncryptionKey({ ...args, databaseUrl })
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("Rotation failed:", err);
      process.exit(1);
    });
}
