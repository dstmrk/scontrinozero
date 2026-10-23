import { describe, expect, it } from "vitest";

import { documentOriginColumns } from "./document-origin";

describe("documentOriginColumns", () => {
  it("un documento dalla web app porta il membro che l'ha emesso", () => {
    expect(documentOriginColumns({ memberId: "member-1" })).toEqual({
      createdBy: "member-1",
      apiKeyId: null,
    });
  });

  // Decisione 13 sulla issue #1099: i documenti della Developer API restano
  // attribuiti alla chiave, e nello storico appaiono come "via API".
  it("un documento dalla Developer API porta la chiave, non un membro", () => {
    expect(documentOriginColumns({ apiKeyId: "key-1" })).toEqual({
      createdBy: null,
      apiKeyId: "key-1",
    });
  });
});
