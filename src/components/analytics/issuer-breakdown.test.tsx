// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { IssuerBreakdownEntry } from "@/server/analytics-actions";
import { hasIssuersBesidesOwner, IssuerBreakdown } from "./issuer-breakdown";

const OWNER: IssuerBreakdownEntry = {
  key: "owner-id",
  kind: "owner",
  label: "Titolare",
  revenueCents: 12_000,
  count: 10,
};
const LUCA: IssuerBreakdownEntry = {
  key: "luca-id",
  kind: "collaborator",
  label: "Luca",
  revenueCents: 4_550,
  count: 3,
};
const API: IssuerBreakdownEntry = {
  key: "api",
  kind: "api",
  label: "Developer API",
  revenueCents: -300,
  count: 0,
};

describe("hasIssuersBesidesOwner", () => {
  it("con il solo titolare la ripartizione non serve", () => {
    expect(hasIssuersBesidesOwner([OWNER])).toBe(false);
    expect(hasIssuersBesidesOwner([])).toBe(false);
  });

  it("un collaboratore o la Developer API la rendono utile", () => {
    expect(hasIssuersBesidesOwner([OWNER, LUCA])).toBe(true);
    expect(hasIssuersBesidesOwner([OWNER, API])).toBe(true);
  });
});

describe("IssuerBreakdown", () => {
  it("una riga per chi ha emesso, con scontrini e ricavi", () => {
    render(<IssuerBreakdown data={[OWNER, LUCA, API]} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const luca = within(rows[1]);
    expect(luca.getByText("Luca")).toBeInTheDocument();
    expect(luca.getByText("3")).toBeInTheDocument();
    expect(luca.getByText("45,50 €")).toBeInTheDocument();
  });

  it("i ricavi negativi di chi ha fatto solo resi restano visibili", () => {
    render(<IssuerBreakdown data={[API]} />);

    expect(screen.getByText("-3,00 €")).toBeInTheDocument();
  });

  it("intesta le colonne per gli screen reader", () => {
    render(<IssuerBreakdown data={[OWNER]} />);

    expect(
      screen.getByRole("columnheader", { name: "Emesso da" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Ricavi" }),
    ).toBeInTheDocument();
  });
});
