import { describe, expect, it } from "vitest";
import { TRIAL_DAYS } from "@/lib/plans-shared";
import { resolveReceiptFooterNote } from "./footer-note";

const NOTE = "Arrivederci e grazie!";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Owner "pieno Pro": il caso base che gli altri test variano. */
const proOwner = {
  plan: "pro",
  trialStartedAt: null,
  planExpiresAt: null,
  referralBonusDays: 0,
};

describe("resolveReceiptFooterNote", () => {
  it("restituisce la nota normalizzata a un piano Pro", () => {
    expect(
      resolveReceiptFooterNote("  Arrivederci e grazie!  ", proOwner),
    ).toBe(NOTE);
  });

  it("vale anche per unlimited", () => {
    expect(
      resolveReceiptFooterNote(NOTE, { ...proOwner, plan: "unlimited" }),
    ).toBe(NOTE);
  });

  it("nasconde la nota a Starter", () => {
    expect(
      resolveReceiptFooterNote(NOTE, { ...proOwner, plan: "starter" }),
    ).toBeNull();
  });

  // Il trial è una prova di Pro: la nota si può impostare e si stampa.
  it("stampa la nota durante un trial attivo", () => {
    expect(
      resolveReceiptFooterNote(NOTE, {
        ...proOwner,
        plan: "trial",
        trialStartedAt: daysAgo(TRIAL_DAYS - 1),
      }),
    ).toBe(NOTE);
  });

  it("smette di stamparla a trial scaduto", () => {
    expect(
      resolveReceiptFooterNote(NOTE, {
        ...proOwner,
        plan: "trial",
        trialStartedAt: daysAgo(TRIAL_DAYS + 1),
      }),
    ).toBeNull();
  });

  // Stesso bonus referral applicato da `fetchPlan`: un trial prolungato che
  // l'app mostra ancora attivo non deve perdere la nota sulla carta.
  it("tiene conto dei giorni bonus referral sul trial", () => {
    expect(
      resolveReceiptFooterNote(NOTE, {
        ...proOwner,
        plan: "trial",
        trialStartedAt: daysAgo(TRIAL_DAYS + 5),
        referralBonusDays: 30,
      }),
    ).toBe(NOTE);
  });

  // Safety-net webhook Stripe perso: piano pagato scaduto oltre la grazia.
  it("nasconde la nota a un piano pagato scaduto oltre la grazia", () => {
    expect(
      resolveReceiptFooterNote(NOTE, {
        ...proOwner,
        planExpiresAt: daysAgo(365),
      }),
    ).toBeNull();
  });

  it("restituisce null se la nota è assente o di soli spazi", () => {
    expect(resolveReceiptFooterNote(null, proOwner)).toBeNull();
    expect(resolveReceiptFooterNote("   ", proOwner)).toBeNull();
  });

  // Drift di schema su profiles.plan: si degrada nascondendo la nota invece di
  // castare a Plan. Il documento fiscale resta stampabile.
  it("nasconde la nota se il piano non è un valore riconosciuto", () => {
    expect(
      resolveReceiptFooterNote(NOTE, { ...proOwner, plan: "gold" }),
    ).toBeNull();
    expect(
      resolveReceiptFooterNote(NOTE, { ...proOwner, plan: null }),
    ).toBeNull();
  });

  it("normalizza gli a capo come alla scrittura", () => {
    expect(
      resolveReceiptFooterNote("Grazie!\r\n\r\n A presto ", proOwner),
    ).toBe("Grazie!\nA presto");
  });
});
