import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanBadge } from "./plan-badge";

describe("PlanBadge", () => {
  it.each([
    ["trial", "Prova gratuita"],
    ["starter", "Starter"],
    ["pro", "Pro"],
    ["team", "Team"],
    ["unlimited", "Unlimited"],
  ])("mostra l'etichetta del piano %s", (plan, label) => {
    render(<PlanBadge plan={plan} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("un piano senza etichetta mostra il valore grezzo", () => {
    render(<PlanBadge plan="developer_indie" />);
    expect(screen.getByText("developer_indie")).toBeInTheDocument();
  });
});
