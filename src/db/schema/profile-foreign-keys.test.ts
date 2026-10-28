import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index";
import { profiles } from "./profiles";

/**
 * Cancellare un account è cancellare la sua riga `profiles` (`purgeUserById`):
 * una FK verso `profiles` senza `ON DELETE CASCADE` fa fallire quella DELETE
 * dopo che l'utente auth è già stato cancellato, e il profilo resta orfano. È
 * successo con `referral_redemptions` e `partners` (migrazione 0047): chi
 * aveva presentato qualcuno non si poteva cancellare.
 *
 * Lo schema Drizzle rispecchia le migrazioni, quindi una FK nuova verso
 * `profiles` scritta senza cascata fallisce qui prima di arrivare al DB.
 */
function foreignKeysToProfiles() {
  return Object.values<unknown>(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.foreignKeys
        .filter((fk) => fk.reference().foreignTable === profiles)
        .map((fk) => ({
          fk: `${config.name}.${fk
            .reference()
            .columns.map((column) => column.name)
            .join(",")}`,
          onDelete: fk.onDelete,
        }));
    });
}

describe("FK verso profiles", () => {
  it("le trova tutte, comprese quelle del referral", () => {
    expect(foreignKeysToProfiles().map(({ fk }) => fk)).toEqual(
      expect.arrayContaining([
        "businesses.profile_id",
        "api_keys.profile_id",
        "referral_redemptions.referrer_id",
        "referral_redemptions.referee_id",
        "partners.referrer_profile_id",
      ]),
    );
  });

  it("si cancellano tutte con il profilo", () => {
    const blocking = foreignKeysToProfiles().filter(
      ({ onDelete }) => onDelete !== "cascade",
    );

    expect(blocking).toEqual([]);
  });
});
