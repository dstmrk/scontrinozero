// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  readPruneConfig,
  DEFAULT_DELETE_AFTER_DAYS,
  DEFAULT_WARN_BEFORE_DAYS,
  MIN_DELETE_AFTER_DAYS,
} from "./inactive-user-prune-config";

describe("readPruneConfig", () => {
  it("è disabilitato di default (feature opt-in)", () => {
    const config = readPruneConfig({});
    expect(config.enabled).toBe(false);
  });

  it("abilita solo con il valore esatto 'true' (case-insensitive)", () => {
    expect(
      readPruneConfig({ INACTIVE_USER_PRUNE_ENABLED: "true" }).enabled,
    ).toBe(true);
    expect(
      readPruneConfig({ INACTIVE_USER_PRUNE_ENABLED: "TRUE" }).enabled,
    ).toBe(true);
    expect(readPruneConfig({ INACTIVE_USER_PRUNE_ENABLED: "1" }).enabled).toBe(
      false,
    );
    expect(
      readPruneConfig({ INACTIVE_USER_PRUNE_ENABLED: "false" }).enabled,
    ).toBe(false);
  });

  it("usa i default quando le soglie sono assenti", () => {
    const config = readPruneConfig({});
    expect(config.deleteAfterDays).toBe(DEFAULT_DELETE_AFTER_DAYS);
    expect(config.warnBeforeDays).toBe(DEFAULT_WARN_BEFORE_DAYS);
  });

  it("legge soglie custom valide (es. dev più aggressivo)", () => {
    const config = readPruneConfig({
      INACTIVE_USER_DELETE_AFTER_DAYS: "90",
      INACTIVE_USER_WARN_BEFORE_DAYS: "7",
    });
    expect(config.deleteAfterDays).toBe(90);
    expect(config.warnBeforeDays).toBe(7);
  });

  it("ricade sul default su valori non numerici o ≤ 0", () => {
    const config = readPruneConfig({
      INACTIVE_USER_DELETE_AFTER_DAYS: "abc",
      INACTIVE_USER_WARN_BEFORE_DAYS: "-5",
    });
    expect(config.deleteAfterDays).toBe(DEFAULT_DELETE_AFTER_DAYS);
    expect(config.warnBeforeDays).toBe(DEFAULT_WARN_BEFORE_DAYS);
  });

  it("clampa warnBeforeDays sotto deleteAfterDays (invariante preavviso)", () => {
    const config = readPruneConfig({
      INACTIVE_USER_DELETE_AFTER_DAYS: "10",
      INACTIVE_USER_WARN_BEFORE_DAYS: "30",
    });
    expect(config.warnBeforeDays).toBe(9);
    expect(config.warnBeforeDays).toBeLessThan(config.deleteAfterDays);
  });

  it("clampa warnBeforeDays a minimo 1 quando deleteAfterDays è 1", () => {
    const config = readPruneConfig({
      INACTIVE_USER_DELETE_AFTER_DAYS: "1",
      INACTIVE_USER_WARN_BEFORE_DAYS: "5",
    });
    expect(config.warnBeforeDays).toBe(1);
  });

  describe("floor di sicurezza su deleteAfterDays (REVIEW #39)", () => {
    it("disabilita lo sweep quando deleteAfterDays è sotto il floor", () => {
      const config = readPruneConfig({
        INACTIVE_USER_PRUNE_ENABLED: "true",
        INACTIVE_USER_DELETE_AFTER_DAYS: "3",
      });
      expect(config.enabled).toBe(false);
      // `3` viola anche l'invariante del preavviso (default 30 ≥ 3): due warning.
      const floorWarning = config.warnings.find((w) =>
        w.includes(String(MIN_DELETE_AFTER_DAYS)),
      );
      expect(floorWarning).toContain("INACTIVE_USER_DELETE_AFTER_DAYS");
    });

    it("accetta il valore esattamente al floor (boundary)", () => {
      const config = readPruneConfig({
        INACTIVE_USER_PRUNE_ENABLED: "true",
        INACTIVE_USER_DELETE_AFTER_DAYS: String(MIN_DELETE_AFTER_DAYS),
      });
      expect(config.enabled).toBe(true);
      expect(config.deleteAfterDays).toBe(MIN_DELETE_AFTER_DAYS);
      expect(config.warnings).toEqual([]);
    });

    it("il floor è comunque sotto il default (config di default valida)", () => {
      expect(MIN_DELETE_AFTER_DAYS).toBeLessThanOrEqual(
        DEFAULT_DELETE_AFTER_DAYS,
      );
      const config = readPruneConfig({ INACTIVE_USER_PRUNE_ENABLED: "true" });
      expect(config.enabled).toBe(true);
      expect(config.warnings).toEqual([]);
    });

    it("non riabilita lo sweep se era già spento (floor non è un interruttore)", () => {
      const config = readPruneConfig({
        INACTIVE_USER_DELETE_AFTER_DAYS: "3",
      });
      expect(config.enabled).toBe(false);
    });
  });

  describe("warnings (chiude il gap del docstring, REVIEW #39)", () => {
    it("nessun warning su una config valida", () => {
      const config = readPruneConfig({
        INACTIVE_USER_PRUNE_ENABLED: "true",
        INACTIVE_USER_DELETE_AFTER_DAYS: "365",
        INACTIVE_USER_WARN_BEFORE_DAYS: "30",
      });
      expect(config.warnings).toEqual([]);
    });

    it("segnala la violazione dell'invariante warn ≥ delete", () => {
      const config = readPruneConfig({
        INACTIVE_USER_DELETE_AFTER_DAYS: "365",
        INACTIVE_USER_WARN_BEFORE_DAYS: "400",
      });
      expect(config.warnBeforeDays).toBe(364);
      expect(config.warnings).toHaveLength(1);
      expect(config.warnings[0]).toContain("INACTIVE_USER_WARN_BEFORE_DAYS");
    });

    it("una env presente ma VUOTA è un default, non una violazione (regola 18)", () => {
      const config = readPruneConfig({
        INACTIVE_USER_PRUNE_ENABLED: "true",
        INACTIVE_USER_DELETE_AFTER_DAYS: "",
        INACTIVE_USER_WARN_BEFORE_DAYS: "   ",
      });
      expect(config.deleteAfterDays).toBe(DEFAULT_DELETE_AFTER_DAYS);
      expect(config.warnBeforeDays).toBe(DEFAULT_WARN_BEFORE_DAYS);
      expect(config.warnings).toEqual([]);
      expect(config.enabled).toBe(true);
    });

    it("segnala un valore malformato che ricade sul default", () => {
      const config = readPruneConfig({
        INACTIVE_USER_DELETE_AFTER_DAYS: "36S",
      });
      expect(config.deleteAfterDays).toBe(DEFAULT_DELETE_AFTER_DAYS);
      expect(config.warnings).toHaveLength(1);
      expect(config.warnings[0]).toContain("INACTIVE_USER_DELETE_AFTER_DAYS");
    });

    it("accumula più violazioni insieme", () => {
      const config = readPruneConfig({
        INACTIVE_USER_PRUNE_ENABLED: "true",
        INACTIVE_USER_DELETE_AFTER_DAYS: "10",
        INACTIVE_USER_WARN_BEFORE_DAYS: "50",
      });
      // clamp dell'invariante + floor
      expect(config.warnings.length).toBeGreaterThanOrEqual(2);
      expect(config.enabled).toBe(false);
    });
  });
});
