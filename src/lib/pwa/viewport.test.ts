import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { dashboardViewport } from "./viewport";

const DASHBOARD_LAYOUT = path.join(
  import.meta.dirname,
  "../../app/dashboard/layout.tsx",
);

describe("dashboardViewport", () => {
  it("dichiara viewport-fit=cover, senza il quale env(safe-area-inset-*) vale 0", () => {
    expect(dashboardViewport.viewportFit).toBe("cover");
  });

  it("conserva i default di Next per larghezza e scala iniziale", () => {
    expect(dashboardViewport.width).toBe("device-width");
    expect(dashboardViewport.initialScale).toBe(1);
  });

  it("non blocca lo zoom utente (a11y): né maximumScale né userScalable", () => {
    expect(dashboardViewport.maximumScale).toBeUndefined();
    expect(dashboardViewport.userScalable).toBeUndefined();
  });
});

/**
 * Guardia di cablaggio, sullo stesso principio di `routable-segments.test.ts`.
 *
 * Se qualcuno rimuove l'export `viewport` dal dashboard layout, ogni
 * `env(safe-area-inset-*)` dell'app torna a risolvere `0px`: il CSS resta
 * valido, i test dei componenti continuano a passare (asseriscono la classe,
 * non il valore calcolato) e il difetto è visibile solo su un telefono con
 * home indicator. È esattamente il buco che questo PR chiude — la config
 * esisteva a metà da sempre.
 */
describe("cablaggio del viewport nell'app shell", () => {
  it("il dashboard layout esporta il viewport, non solo lo importa", () => {
    const source = readFileSync(DASHBOARD_LAYOUT, "utf8");

    expect(source).toContain("export const viewport = dashboardViewport");
  });
});
