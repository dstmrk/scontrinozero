// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit } = vi.hoisted(() => ({ mockInit: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: mockInit,
  pinoIntegration: vi.fn(() => ({ name: "Pino" })),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
}));

/**
 * I tre bootstrap di Sentry (server, edge, browser) passano la stessa
 * `dataCollection`: un runtime che ne restasse fuori tornerebbe ai default
 * dell'SDK, che da @sentry/nextjs 11 allegano il body delle richieste.
 */
describe.each([
  { runtime: "server", load: () => import("../../sentry.server.config") },
  { runtime: "edge", load: () => import("../../sentry.edge.config") },
  { runtime: "browser", load: () => import("../../instrumentation-client") },
])("bootstrap Sentry $runtime", ({ load }) => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockClear();
  });

  it("non raccoglie body HTTP", async () => {
    await load();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.calls[0][0].dataCollection).toEqual({
      httpBodies: [],
    });
  });
});
