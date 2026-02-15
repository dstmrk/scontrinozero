/**
 * AdE module entry point — factory per AdeClient.
 *
 * Controllato da `ADE_MODE` environment variable.
 */

import type { AdeClient } from "./client";
import { MockAdeClient } from "./mock-client";
import { RealAdeClient } from "./real-client";

export type AdeMode = "mock" | "real";

/**
 * Creates an AdeClient instance based on the specified mode.
 *
 * @param mode - "mock" for testing, "real" for production
 */
export function createAdeClient(mode: AdeMode): AdeClient {
  switch (mode) {
    case "mock":
      return new MockAdeClient();
    case "real":
      return new RealAdeClient();
    default:
      throw new Error(`Unknown ADE_MODE: ${mode}`);
  }
}
