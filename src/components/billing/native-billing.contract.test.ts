import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia sul contratto "dall'app nativa non ci si abbona" (issue #1044).
 *
 * Il guscio Capacitor carica l'app deployata via `server.url`: ogni superficie
 * di billing della web app finisce dentro l'app iOS/Android. App Store
 * 3.1.1/3.1.3(f) e la Payments policy di Google Play vietano lì sia
 * l'acquisto sia link e call to action verso un acquisto altrove, quindi ogni
 * file che rende checkout, portale Stripe, il link al billing o una CTA
 * d'acquisto deve avere un ramo nativo: `useIsNativeShell` o
 * `WebBillingOnly`.
 *
 * Il gate è lessicale: non prova che il ramo copra proprio quel link (lo
 * fanno i test di ciascun componente), ma fa fallire `npm run test` quando
 * nasce un consumatore nuovo che al guscio non ha pensato affatto.
 */
const SRC_DIR = path.resolve(import.meta.dirname, "..", "..");

/**
 * Le superfici marketing vivono sul dominio marketing, che il guscio non
 * carica: lì prezzi e CTA d'acquisto sono il contenuto.
 */
const OUT_OF_SHELL_DIRS = [
  path.join("app", "(marketing)"),
  path.join("components", "marketing"),
  path.join("components", "help"),
  path.join("lib", "help"),
  path.join("lib", "guide"),
  path.join("lib", "per"),
  path.join("lib", "confronto"),
  path.join("lib", "strumenti"),
];

/** Ciò che porta all'acquisto: endpoint, link, componenti e copy di CTA. */
const BILLING_TOKEN =
  /BILLING_SETTINGS_HREF|CheckoutButton|PlanSelection|\/api\/stripe\/(?:checkout|portal)|Passa a Pro|Attiva un piano|Scegli un piano/;

const NATIVE_BRANCH = /useIsNativeShell|WebBillingOnly/;

/**
 * File che nominano un token senza ramo nativo, ciascuno col motivo per cui
 * il ramo starebbe altrove. Verificate: un'esenzione che smette di
 * corrispondere a un file col token e senza ramo fa fallire la suite.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  [path.join("lib", "plans-shared.ts")]:
    "definisce BILLING_SETTINGS_HREF e TRIAL_EXPIRED_MESSAGE: i render site " +
    "mostrano TrialExpiredMessage, che ha il ramo",
  [path.join("components", "billing", "checkout-button.tsx")]:
    "reso solo da PlanSelection, che nel guscio non rende nulla",
  [path.join("components", "billing", "scroll-to-hash.tsx")]:
    "cita BILLING_SETTINGS_HREF in un commento, non rende link",
};

function isTestFile(name: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(name);
}

function collectSourceFiles(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !isTestFile(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function inShellFiles(): string[] {
  return collectSourceFiles(SRC_DIR, [])
    .map((full) => path.relative(SRC_DIR, full))
    .filter(
      (rel) => !OUT_OF_SHELL_DIRS.some((dir) => rel.startsWith(dir + path.sep)),
    );
}

function read(relative: string): string {
  return readFileSync(path.join(SRC_DIR, relative), "utf8");
}

const billingFiles = inShellFiles().filter((rel) =>
  BILLING_TOKEN.test(read(rel)),
);

describe("contratto billing ↔ guscio nativo (issue #1044)", () => {
  it("trova i consumatori noti (il gate non gira a vuoto)", () => {
    expect(billingFiles).toEqual(
      expect.arrayContaining([
        path.join("components", "billing", "plan-selection.tsx"),
        path.join("components", "billing", "pro-feature-gate.tsx"),
        path.join("app", "dashboard", "settings", "page.tsx"),
      ]),
    );
  });

  it("ogni file con checkout, link al billing o CTA d'acquisto ha un ramo nativo", () => {
    const missing = billingFiles.filter(
      (rel) => !(rel in EXEMPT) && !NATIVE_BRANCH.test(read(rel)),
    );
    expect(missing).toEqual([]);
  });

  it("ogni esenzione corrisponde ancora a un file col token e senza ramo", () => {
    const stale = Object.keys(EXEMPT).filter(
      (rel) => !billingFiles.includes(rel) || NATIVE_BRANCH.test(read(rel)),
    );
    expect(stale).toEqual([]);
  });
});
