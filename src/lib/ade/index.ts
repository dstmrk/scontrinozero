/**
 * AdE module entry point — factory per AdeClient.
 *
 * Controllato da `ADE_MODE` environment variable.
 */

import type { AdeClient } from "./client";
import { MockAdeClient } from "./mock-client";

export type AdeMode = "mock" | "real";

/**
 * Creates an AdeClient instance based on the specified mode.
 *
 * @param mode - "mock" for testing, "real" for production (not yet implemented)
 */
export function createAdeClient(mode: AdeMode): AdeClient {
  switch (mode) {
    case "mock":
      return new MockAdeClient();
    case "real":
      throw new Error(
        "RealAdeClient not yet implemented. Use mode='mock' for now.",
      );
    default:
      throw new Error(`Unknown ADE_MODE: ${mode}`);
  }
}
