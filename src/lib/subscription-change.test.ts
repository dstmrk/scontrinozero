// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  classifySubscriptionChange,
  leavesTeam,
  type PlanChoice,
} from "./subscription-change";

const PLANS: Record<string, PlanChoice> = {
  starter_m: { plan: "starter", interval: "month" },
  pro_m: { plan: "pro", interval: "month" },
  pro_y: { plan: "pro", interval: "year" },
};
const resolve = (priceId: string) => PLANS[priceId] ?? null;

const active = (priceId: string, cancelAtPeriodEnd = false) => ({
  status: "active",
  priceId,
  cancelAtPeriodEnd,
});

describe("classifySubscriptionChange", () => {
  it.each([null, "pending", "canceled", "incomplete", "incomplete_expired"])(
    "da stato %s a active è una nuova sottoscrizione",
    (status) => {
      expect(
        classifySubscriptionChange(
          { status, priceId: null, cancelAtPeriodEnd: false },
          active("pro_m"),
          resolve,
        ),
      ).toEqual({ kind: "started", to: PLANS.pro_m });
    },
  );

  it("trialing conta come abbonamento in corso", () => {
    expect(
      classifySubscriptionChange(
        { status: "pending", priceId: null, cancelAtPeriodEnd: false },
        { status: "trialing", priceId: "pro_m", cancelAtPeriodEnd: false },
        resolve,
      ),
    ).toEqual({ kind: "started", to: PLANS.pro_m });
  });

  it("past_due → active (pagamento rientrato) non è una nuova sottoscrizione", () => {
    expect(
      classifySubscriptionChange(
        { status: "past_due", priceId: "pro_m", cancelAtPeriodEnd: false },
        active("pro_m"),
        resolve,
      ),
    ).toBeNull();
  });

  it("cambio di prezzo (upgrade) riporta partenza e arrivo", () => {
    expect(
      classifySubscriptionChange(active("starter_m"), active("pro_m"), resolve),
    ).toEqual({ kind: "changed", from: PLANS.starter_m, to: PLANS.pro_m });
  });

  it("cambio di sola periodicità è un cambio piano", () => {
    expect(
      classifySubscriptionChange(active("pro_m"), active("pro_y"), resolve),
    ).toEqual({ kind: "changed", from: PLANS.pro_m, to: PLANS.pro_y });
  });

  it("prezzo di partenza non riconosciuto: from è null, non un errore", () => {
    expect(
      classifySubscriptionChange(active("legacy"), active("pro_m"), resolve),
    ).toEqual({ kind: "changed", from: null, to: PLANS.pro_m });
  });

  it("disdetta programmata: cancelAtPeriodEnd false → true", () => {
    expect(
      classifySubscriptionChange(
        active("pro_m", false),
        active("pro_m", true),
        resolve,
      ),
    ).toEqual({ kind: "cancel_scheduled", to: PLANS.pro_m });
  });

  it("riattivazione (true → false) non notifica", () => {
    expect(
      classifySubscriptionChange(
        active("pro_m", true),
        active("pro_m", false),
        resolve,
      ),
    ).toBeNull();
  });

  it("disdetta già programmata e ripetuta non notifica di nuovo", () => {
    expect(
      classifySubscriptionChange(
        active("pro_m", true),
        active("pro_m", true),
        resolve,
      ),
    ).toBeNull();
  });

  it("stesso stato (rinnovo, evento ripetuto) non notifica", () => {
    expect(
      classifySubscriptionChange(active("pro_m"), active("pro_m"), resolve),
    ).toBeNull();
  });

  it.each(["past_due", "incomplete", "canceled", "unpaid"])(
    "stato di arrivo %s su un abbonamento attivo non notifica",
    (status) => {
      expect(
        classifySubscriptionChange(
          active("pro_m"),
          { status, priceId: "pro_m", cancelAtPeriodEnd: false },
          resolve,
        ),
      ).toBeNull();
    },
  );

  it("cambio piano + disdetta nello stesso evento: vince il cambio piano", () => {
    expect(
      classifySubscriptionChange(
        active("starter_m", false),
        active("pro_m", true),
        resolve,
      )?.kind,
    ).toBe("changed");
  });

  it("prezzo di arrivo sconosciuto: niente notifica", () => {
    expect(
      classifySubscriptionChange(active("pro_m"), active("boh"), resolve),
    ).toBeNull();
  });
});

describe("leavesTeam", () => {
  const TEAM = { plan: "team", interval: "year" } as const;
  const PRO = { plan: "pro", interval: "year" } as const;

  it("da Team a un altro piano i collaboratori si fermano", () => {
    expect(leavesTeam({ kind: "changed", from: TEAM, to: PRO })).toBe(true);
  });

  it("la fine di un abbonamento Team li ferma", () => {
    expect(leavesTeam({ kind: "ended", to: TEAM })).toBe(true);
  });

  it.each([
    ["verso Team", { kind: "changed", from: PRO, to: TEAM }],
    ["fra due intervalli di Team", { kind: "changed", from: TEAM, to: TEAM }],
    ["da un piano sconosciuto", { kind: "changed", from: null, to: PRO }],
    ["la fine di Pro", { kind: "ended", to: PRO }],
    ["la disdetta solo programmata", { kind: "cancel_scheduled", to: TEAM }],
    ["un abbonamento nuovo", { kind: "started", to: PRO }],
  ] as const)("%s no", (_label, change) => {
    expect(leavesTeam(change)).toBe(false);
  });
});
