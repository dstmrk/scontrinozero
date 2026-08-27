import { describe, it, expect } from "vitest";
import {
  DISCOUNTS_PRO_MESSAGE,
  discountGateError,
  MIXED_PAYMENT_PRO_MESSAGE,
  mixedPaymentGateError,
} from "@/lib/receipts/pro-feature-gates";

const PRO = { plan: "pro" as const, planExpiresAt: null, trialStartedAt: null };
const STARTER = {
  plan: "starter" as const,
  planExpiresAt: null,
  trialStartedAt: null,
};

describe("discountGateError", () => {
  it("lascia passare uno scontrino senza sconti su qualsiasi piano", () => {
    expect(discountGateError(STARTER, { globalDiscount: 0 })).toBeNull();
    expect(discountGateError(STARTER, {})).toBeNull();
  });

  it("lascia passare lo sconto a pagare su un piano Pro", () => {
    expect(discountGateError(PRO, { globalDiscount: 0.4 })).toBeNull();
  });

  it("blocca lo sconto a pagare su un piano senza Pro", () => {
    expect(discountGateError(STARTER, { globalDiscount: 0.4 })).toBe(
      DISCOUNTS_PRO_MESSAGE,
    );
  });

  it("lascia passare gli sconti durante il trial", () => {
    // Il trial include le feature Pro visibili (CLAUDE.md, tabella pricing).
    expect(
      discountGateError(
        { plan: "trial", planExpiresAt: null, trialStartedAt: new Date() },
        { globalDiscount: 1 },
      ),
    ).toBeNull();
  });

  it("blocca gli sconti su un trial scaduto", () => {
    const longAgo = new Date("2020-01-01T00:00:00Z");
    expect(
      discountGateError(
        { plan: "trial", planExpiresAt: null, trialStartedAt: longAgo },
        { globalDiscount: 1 },
      ),
    ).toBe(DISCOUNTS_PRO_MESSAGE);
  });

  it("blocca anche lo sconto di riga su un piano senza Pro", () => {
    expect(discountGateError(STARTER, { lines: [{ lineDiscount: 2 }] })).toBe(
      DISCOUNTS_PRO_MESSAGE,
    );
  });

  it("lascia passare lo sconto di riga su un piano Pro", () => {
    expect(discountGateError(PRO, { lines: [{ lineDiscount: 2 }] })).toBeNull();
  });

  it("ignora le righe senza sconto", () => {
    expect(
      discountGateError(STARTER, {
        lines: [{ lineDiscount: 0 }, {}],
      }),
    ).toBeNull();
  });

  it("blocca se anche una sola riga di molte è scontata", () => {
    expect(
      discountGateError(STARTER, {
        lines: [{}, { lineDiscount: 0 }, { lineDiscount: 0.5 }],
      }),
    ).toBe(DISCOUNTS_PRO_MESSAGE);
  });

  it("non blocca mai per un errore di piano quando lo sconto è assente", () => {
    // Un piano scaduto che NON sconta emette normalmente: il gate riguarda la
    // feature, non l'emissione — quella la governa `canEmit`.
    const expired = {
      plan: "pro" as const,
      planExpiresAt: new Date("2020-01-01T00:00:00Z"),
      trialStartedAt: null,
    };
    expect(discountGateError(expired, {})).toBeNull();
    expect(discountGateError(expired, { globalDiscount: 0.5 })).toBe(
      DISCOUNTS_PRO_MESSAGE,
    );
  });
});

describe("mixedPaymentGateError", () => {
  const starter = {
    plan: "starter" as const,
    planExpiresAt: null,
    trialStartedAt: null,
  };
  const pro = {
    plan: "pro" as const,
    planExpiresAt: null,
    trialStartedAt: null,
  };
  const mixed = [
    { type: "PC" as const, amount: 1 },
    { type: "PE" as const, amount: 2 },
  ];

  it("blocca il pagamento misto su un piano non Pro", () => {
    expect(mixedPaymentGateError(starter, { payments: mixed })).toBe(
      MIXED_PAYMENT_PRO_MESSAGE,
    );
  });

  it("lascia passare il pagamento misto su Pro", () => {
    expect(mixedPaymentGateError(pro, { payments: mixed })).toBeNull();
  });

  it("non scatta su uno scontrino senza ripartizione", () => {
    expect(mixedPaymentGateError(starter, {})).toBeNull();
    expect(
      mixedPaymentGateError(starter, {
        payments: [{ type: "PC", amount: 3 }],
      }),
    ).toBeNull();
  });

  it("non scatta su una ripartizione con l'altra modalità a zero", () => {
    // È un pagamento singolo dichiarato in forma di array: gatearlo
    // negherebbe a uno Starter un pagamento che misto non è.
    expect(
      mixedPaymentGateError(starter, {
        payments: [
          { type: "PC", amount: 0 },
          { type: "PE", amount: 3 },
        ],
      }),
    ).toBeNull();
  });

  it("blocca un trial scaduto e lascia passare un trial attivo", () => {
    const trialStartedAt = new Date();
    expect(
      mixedPaymentGateError(
        { plan: "trial", planExpiresAt: null, trialStartedAt },
        { payments: mixed },
      ),
    ).toBeNull();
    expect(
      mixedPaymentGateError(
        {
          plan: "trial",
          planExpiresAt: null,
          trialStartedAt: new Date("2020-01-01"),
        },
        { payments: mixed },
      ),
    ).toBe(MIXED_PAYMENT_PRO_MESSAGE);
  });
});
