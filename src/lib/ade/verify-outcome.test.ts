// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AdeAccountLockedError,
  AdeAuthError,
  AdeError,
  AdeNetworkError,
  AdeNoPartitaIvaError,
  AdePasswordExpiredError,
  AdePortalError,
  AdeReauthRequiredError,
  AdeSpidTimeoutError,
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
} from "./errors";
import {
  RECORDED_VERIFY_OUTCOMES,
  classifyAdeLoginFailure,
} from "./verify-outcome";

/**
 * Il vocabolario è metà di un contratto: l'altra metà è il CHECK della
 * migrazione 0038. Questi test coprono il lato TypeScript — che la
 * classificazione non collassi casi distinti — mentre l'allineamento col DB
 * è garantito dal fatto che un valore fuori CHECK fa fallire la UPDATE, che
 * è best-effort per costruzione (REVIEW.md #107).
 */
describe("classifyAdeLoginFailure", () => {
  it.each([
    [new AdeAuthError(), "auth_error"],
    [new AdeAccountLockedError(), "account_locked"],
    [new AdePasswordExpiredError(), "password_expired"],
    [
      new AdeUtenzaSelectionRequiredError([
        { piva: "07790350966", provenienza: "diretta" },
      ]),
      "utenza_selection_required",
    ],
    [new AdeUtenzaNotAvailableError("07790350966"), "utenza_not_available"],
    [new AdeNoPartitaIvaError("wizard"), "no_partita_iva"],
    [new AdeReauthRequiredError("cie"), "reauth_required"],
  ])("mappa %s sul proprio esito", (err, expected) => {
    expect(classifyAdeLoginFailure(err)).toBe(expected);
  });

  it.each([
    ["rete", new AdeNetworkError(new Error("ECONNRESET"))],
    ["timeout push", new AdeSpidTimeoutError(30)],
    ["5xx del portale", new AdePortalError(503, "Service Unavailable")],
  ])("classifica %s come transitorio", (_label, err) => {
    // Un guasto temporaneo non è una causa di abbandono: tenerlo separato
    // evita di leggere un downtime AdE come un problema di onboarding.
    expect(classifyAdeLoginFailure(err)).toBe("transient");
  });

  it("un 4xx del portale NON è transitorio", () => {
    expect(
      classifyAdeLoginFailure(new AdePortalError(400, "Bad Request")),
    ).toBe("failure");
  });

  it("un errore sconosciuto ricade su 'failure' invece di restare muto", () => {
    expect(classifyAdeLoginFailure(new Error("boh"))).toBe("failure");
    expect(classifyAdeLoginFailure(new AdeError("X", "ignoto"))).toBe(
      "failure",
    );
    expect(classifyAdeLoginFailure("una stringa")).toBe("failure");
    expect(classifyAdeLoginFailure(undefined)).toBe("failure");
  });

  it("ogni valore prodotto appartiene al vocabolario", () => {
    const errors: unknown[] = [
      new AdeAuthError(),
      new AdePasswordExpiredError(),
      new AdeUtenzaSelectionRequiredError([]),
      new AdeUtenzaNotAvailableError("07790350966"),
      new AdeNoPartitaIvaError("wizard"),
      new AdeReauthRequiredError("cie"),
      new AdeNetworkError(new Error("x")),
      new Error("boh"),
    ];

    for (const err of errors) {
      expect(RECORDED_VERIFY_OUTCOMES).toContain(classifyAdeLoginFailure(err));
    }
  });
});

describe("RECORDED_VERIFY_OUTCOMES", () => {
  it("non contiene duplicati: un doppione spaccherebbe un GROUP BY in due", () => {
    expect(new Set(RECORDED_VERIFY_OUTCOMES).size).toBe(
      RECORDED_VERIFY_OUTCOMES.length,
    );
  });

  it("include i tre esiti che nessun errore di login produce", () => {
    // Non escono da `classifyAdeLoginFailure` — arrivano dai rami post-login e
    // dal backfill della 0038 — ma il CHECK li pretende lo stesso.
    expect(RECORDED_VERIFY_OUTCOMES).toContain("success");
    expect(RECORDED_VERIFY_OUTCOMES).toContain("piva_conflict");
    expect(RECORDED_VERIFY_OUTCOMES).toContain("unknown_pre_tracking");
  });
});
