import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import PrivacyPage from "./page";

describe("/privacy", () => {
  it("porta alla v02, che descrive i dati dei collaboratori", () => {
    PrivacyPage();

    expect(mockRedirect).toHaveBeenCalledWith("/privacy/v02");
  });

  // Un redirect verso una versione senza pagina manderebbe il link della
  // registrazione e dell'invito a un 404.
  it("la versione del redirect ha la sua pagina", () => {
    PrivacyPage();
    const target = String(mockRedirect.mock.calls.at(-1)?.[0]);
    const page = path.join(
      import.meta.dirname,
      path.basename(target),
      "page.tsx",
    );

    expect(existsSync(page)).toBe(true);
  });
});
