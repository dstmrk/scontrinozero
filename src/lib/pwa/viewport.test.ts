import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  DARK_SURFACE,
  LIGHT_SURFACE,
  dashboardViewport,
  rootViewport,
} from "./viewport";

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

describe("theme-color", () => {
  it("fuori dal dashboard resta chiaro e basta: lì il dark mode non esiste", () => {
    expect(rootViewport.themeColor).toBe(LIGHT_SURFACE);
  });

  it("nel dashboard segue lo schema colore del sistema", () => {
    expect(dashboardViewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: LIGHT_SURFACE },
      { media: "(prefers-color-scheme: dark)", color: DARK_SURFACE },
    ]);
  });

  it("i due colori sono l'esatto --background dei due temi", () => {
    // oklch(1 0 0) e oklch(0.145 0 0) di src/app/globals.css, in esadecimale:
    // un meta tag non accetta oklch() su tutti i browser che ci interessano.
    expect(LIGHT_SURFACE).toBe("#ffffff");
    expect(DARK_SURFACE).toBe("#0a0a0a");
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
