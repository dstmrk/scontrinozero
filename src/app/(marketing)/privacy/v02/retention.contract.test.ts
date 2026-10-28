// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ getDb: vi.fn() }));

import { INVITE_TTL_MS } from "@/lib/collaborator-invites";
import {
  DEFAULT_DELETE_AFTER_DAYS,
  DEFAULT_WARN_BEFORE_DAYS,
} from "@/lib/services/inactive-user-prune-config";

/**
 * La Privacy v02 scrive a mano tre durate che il codice decide altrove: la
 * validità di un invito, la soglia di inattività e il preavviso. Un testo
 * legale versionato non diventa un template (skill `marketing-content`), quindi
 * se una di queste costanti cambia il test fallisce: serve una nuova versione
 * della Privacy, non un ritocco della v02.
 *
 * Le soglie di inattività lette qui sono i default: un ambiente che le
 * sovrascrive con `INACTIVE_USER_*` deve restare allineato a mano.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TEXT = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8")
  .replaceAll('{" "}', " ")
  .replaceAll(/<[^>]+>/g, "")
  .replaceAll(/\s+/g, " ");

describe("Privacy v02 ↔ durate del codice", () => {
  it("un invito vale quanto dice la Privacy", () => {
    expect(TEXT).toContain(`validi ${INVITE_TTL_MS / MS_PER_DAY} giorni`);
  });

  it("un account si cancella dopo i 12 mesi che dice la Privacy", () => {
    expect(DEFAULT_DELETE_AFTER_DAYS).toBe(365);
    expect(TEXT).toContain("per 12 mesi, è cancellato");
  });

  it("il preavviso arriva quando dice la Privacy", () => {
    expect(TEXT).toContain(
      `preavviso ${DEFAULT_WARN_BEFORE_DAYS} giorni prima`,
    );
  });
});
