// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SENTRY_DATA_COLLECTION } from "@/lib/sentry-filters";

const { mockInit } = vi.hoisted(() => ({ mockInit: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: mockInit,
  pinoIntegration: vi.fn(() => ({ name: "Pino" })),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
}));

/**
 * I due bootstrap di Sentry (server, browser) passano la stessa
 * `dataCollection`: un runtime che ne restasse fuori tornerebbe ai default
 * dell'SDK, che da @sentry/nextjs 11 allegano body delle richieste e IP del
 * client. Cosa contiene la costante lo verifica, con l'SDK vero,
 * `sentry-data-collection.test.ts`.
 */
describe.each([
  { runtime: "server", load: () => import("../../sentry.server.config") },
  { runtime: "browser", load: () => import("../../instrumentation-client") },
])("bootstrap Sentry $runtime", ({ load }) => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockClear();
  });

  it("passa la dataCollection condivisa", async () => {
    await load();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.calls[0][0].dataCollection).toEqual(
      SENTRY_DATA_COLLECTION,
    );
  });
});
