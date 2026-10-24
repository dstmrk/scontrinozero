import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { collaboratorInvites } from "./collaborator-invites";

describe("collaborator_invites schema", () => {
  const config = getTableConfig(collaboratorInvites);

  it("has the correct SQL table name", () => {
    expect(getTableName(collaboratorInvites)).toBe("collaborator_invites");
  });

  // Nessuna colonna di stato: revoca e accettazione cancellano la riga.
  it("ha solo le colonne di un invito in attesa", () => {
    expect(config.columns.map((column) => column.name).sort()).toEqual([
      "business_id",
      "created_at",
      "email",
      "expires_at",
      "id",
      "token_hash",
    ]);
  });

  it("segue l'attività quando l'attività viene cancellata", () => {
    const fk = config.foreignKeys.find(
      (key) => getTableName(key.reference().foreignTable) === "businesses",
    );
    expect(fk?.onDelete).toBe("cascade");
  });

  it.each([
    ["idx_collaborator_invites_token_hash", ["token_hash"]],
    // Reinviare sostituisce l'invito, non ne aggiunge un secondo.
    ["idx_collaborator_invites_business_email", ["business_id", "email"]],
  ])("ha l'indice unico %s", (name, columns) => {
    const index = config.indexes.find((idx) => idx.config.name === name);
    expect(index?.config.unique).toBe(true);
    expect(
      index?.config.columns.map((column) => (column as { name: string }).name),
    ).toEqual(columns);
  });
});
