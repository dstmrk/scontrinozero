import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  checkSentryRuntimeInjection,
  HOOK_RELATIVE_PATH,
} from "../../../scripts/check-sentry-runtime-injection.mjs";

let standaloneDir: string;

beforeEach(async () => {
  standaloneDir = await mkdtemp(join(tmpdir(), "standalone-"));
});

afterEach(async () => {
  await rm(standaloneDir, { recursive: true, force: true });
});

/** Scrive un file sotto la directory `build/esm` del pacchetto finto. */
async function writeEsmFile(relativePath: string, content: string) {
  const esmDir = join(standaloneDir, HOOK_RELATIVE_PATH, "..");
  const filePath = join(esmDir, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, content);
  // `type: module` come nel pacchetto reale: senza, Node tratterebbe i `.js`
  // come CommonJS e l'`export` fallirebbe per un motivo diverso da quello
  // che il check deve rilevare.
  await writeFile(join(esmDir, "package.json"), '{"type":"module"}');
}

describe("checkSentryRuntimeInjection", () => {
  it("passa quando il loader e i suoi import sono tutti nella standalone", async () => {
    await writeEsmFile("hook.js", 'export { load } from "./vendored/hook.js";');
    await writeEsmFile("vendored/hook.js", "export const load = () => {};");

    const result = checkSentryRuntimeInjection(standaloneDir);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("fallisce quando il file tracing ha copiato il loader ma non i suoi import", async () => {
    // È il caso reale di v1.9.0: `build/esm/hook.js` c'era, `build/esm/vendored/`
    // no, e Sentry degradava a un warning nei log del container.
    await writeEsmFile("hook.js", 'export { load } from "./vendored/hook.js";');

    const result = checkSentryRuntimeInjection(standaloneDir);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("vendored/hook.js");
  });

  it("fallisce quando il loader non è stato copiato affatto", () => {
    const result = checkSentryRuntimeInjection(standaloneDir);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(HOOK_RELATIVE_PATH);
  });

  it("fallisce quando la standalone non esiste (next build non girato)", () => {
    const result = checkSentryRuntimeInjection(join(standaloneDir, "assente"));

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
