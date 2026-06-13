// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnnouncement } from "./announcement";
import { logger } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("getAnnouncement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("ritorna null quando ANNOUNCEMENT_MESSAGE è assente", () => {
    expect(getAnnouncement()).toBeNull();
  });

  it("ritorna null quando il messaggio è vuoto", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "");
    expect(getAnnouncement()).toBeNull();
  });

  it("ritorna null quando il messaggio è solo spazi", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "   ");
    expect(getAnnouncement()).toBeNull();
  });

  it("ritorna l'annuncio con messaggio trimmato e livello info di default", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "  Manutenzione  ");

    const result = getAnnouncement();

    expect(result).toMatchObject({
      message: "Manutenzione",
      level: "info",
      dismissible: true,
    });
    expect(result?.dismissKey).toMatch(/^announcement-dismissed:/);
  });

  it.each(["info", "warning", "critical"] as const)(
    "accetta il livello valido %s",
    (level) => {
      vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Avviso");
      vi.stubEnv("ANNOUNCEMENT_LEVEL", level);

      expect(getAnnouncement()?.level).toBe(level);
    },
  );

  it("normalizza il livello case-insensitive", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Avviso");
    vi.stubEnv("ANNOUNCEMENT_LEVEL", "WARNING");

    expect(getAnnouncement()?.level).toBe("warning");
  });

  it("degrada a info e logga un warn su livello non riconosciuto", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Avviso");
    vi.stubEnv("ANNOUNCEMENT_LEVEL", "boom");

    expect(getAnnouncement()?.level).toBe("info");
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("rende critical non dismissibile", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Incidente in corso");
    vi.stubEnv("ANNOUNCEMENT_LEVEL", "critical");

    expect(getAnnouncement()?.dismissible).toBe(false);
  });

  it("produce una dismissKey stabile a parità di messaggio", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Stesso messaggio");
    const first = getAnnouncement()?.dismissKey;

    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Stesso messaggio");
    const second = getAnnouncement()?.dismissKey;

    expect(first).toBe(second);
  });

  it("produce una dismissKey diversa al cambio messaggio", () => {
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Messaggio uno");
    const first = getAnnouncement()?.dismissKey;

    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "Messaggio due");
    const second = getAnnouncement()?.dismissKey;

    expect(first).not.toBe(second);
  });
});
