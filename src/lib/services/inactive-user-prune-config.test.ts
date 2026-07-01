// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  readPruneConfig,
  DEFAULT_DELETE_AFTER_DAYS,
  DEFAULT_WARN_BEFORE_DAYS,
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
});
