import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/db", () => ({ getDb: vi.fn() }));

import { CURRENT_COLLABORATOR_TERMS_VERSION } from "@/lib/collaborator-invites";
import CondizioniCollaboratoriPage from "./page";

describe("/condizioni-collaboratori", () => {
  it("porta alla versione che il titolare accetta", () => {
    CondizioniCollaboratoriPage();

    expect(mockRedirect).toHaveBeenCalledWith(
      `/condizioni-collaboratori/${CURRENT_COLLABORATOR_TERMS_VERSION}`,
    );
  });

  // Alzare la versione senza pubblicarne il testo farebbe accettare al
  // titolare un documento che risponde 404.
  it("la versione corrente ha la sua pagina", () => {
    const page = path.join(
      import.meta.dirname,
      CURRENT_COLLABORATOR_TERMS_VERSION,
      "page.tsx",
    );

    expect(existsSync(page)).toBe(true);
  });
});
