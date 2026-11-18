/**
 * Unit test: verifica che le nuove colonne billing su profiles e la tabella
 * subscriptions siano correttamente definite nello schema Drizzle.
 */
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { profiles, subscriptions } from "@/db/schema";

describe("profiles billing columns", () => {
  it("has plan column with default 'trial'", () => {
    const config = getTableConfig(profiles);
    const planCol = config.columns.find((c) => c.name === "plan");
    expect(planCol).toBeDefined();
    expect(planCol?.default).toBe("trial");
    expect(planCol?.notNull).toBe(true);
  });

  it("has trial_started_at column", () => {
    const config = getTableConfig(profiles);
    const col = config.columns.find((c) => c.name === "trial_started_at");
    expect(col).toBeDefined();
  });

  it("has plan_expires_at column (nullable)", () => {
    const config = getTableConfig(profiles);
    const col = config.columns.find((c) => c.name === "plan_expires_at");
    expect(col).toBeDefined();
    expect(col?.notNull).toBeFalsy();
  });

  it("has partita_iva column with UNIQUE constraint", () => {
    const config = getTableConfig(profiles);
    const col = config.columns.find((c) => c.name === "partita_iva");
    expect(col).toBeDefined();
    expect(col?.isUnique).toBe(true);
  });
});

describe("subscriptions table", () => {
  it("table name is 'subscriptions'", () => {
    const config = getTableConfig(subscriptions);
    expect(config.name).toBe("subscriptions");
  });

  it("has user_id column with UNIQUE constraint", () => {
    const config = getTableConfig(subscriptions);
    const col = config.columns.find((c) => c.name === "user_id");
    expect(col).toBeDefined();
    expect(col?.isUnique).toBe(true);
    expect(col?.notNull).toBe(true);
  });

  it("has stripe_customer_id column with UNIQUE constraint", () => {
    const config = getTableConfig(subscriptions);
    const col = config.columns.find((c) => c.name === "stripe_customer_id");
    expect(col).toBeDefined();
    expect(col?.isUnique).toBe(true);
  });

  it("has stripe_subscription_id column with UNIQUE constraint", () => {
    const config = getTableConfig(subscriptions);
    const col = config.columns.find((c) => c.name === "stripe_subscription_id");
    expect(col).toBeDefined();
    expect(col?.isUnique).toBe(true);
  });

  it("has status, stripe_price_id, interval, current_period_end columns", () => {
    const config = getTableConfig(subscriptions);
    const names = config.columns.map((c) => c.name);
    expect(names).toContain("status");
    expect(names).toContain("stripe_price_id");
    expect(names).toContain("interval");
    expect(names).toContain("current_period_end");
  });
});
